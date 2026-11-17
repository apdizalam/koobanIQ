import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Request } from 'express';
import mongoose, { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User, type UserDocument } from '../src/models/User.js';
import { setUserRole } from '../src/services/adminUserService.js';
import { promoteToAdmin } from '../src/services/userService.js';

// Own database per run: the "last admin" rule and the search counts must not see
// users from other test files or other CI jobs. Dropped at the end.
const DB_NAME = `kobaniq_test_users_${RUN_ID}`;
const PASSWORD = 'correct-horse-6';

let server: Server;
let baseUrl: string;
let adminToken: string;
let adminId: string;

const call = (path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
  fetch(`${baseUrl}/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

const login = async (email: string) =>
  call('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });

/** Registers an account and returns its id and a fresh login. */
async function account(email: string, admin = false) {
  assert.equal(
    (await call('/auth/register', { method: 'POST', body: { email, password: PASSWORD } })).status,
    201,
  );
  if (admin) await promoteToAdmin(email);
  const body = await (await login(email)).json();
  return { id: body.data.user.id as string, token: body.data.accessToken as string };
}

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User.syncIndexes(), RefreshToken.syncIndexes(), AuditLog.syncIndexes()]);
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const admin = await account('boss@users.invalid', true);
  adminToken = admin.token;
  adminId = admin.id;
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('list: search by email, filter by role and status, paging, no password hashes', async () => {
  await account('amina@users.invalid');
  await account('amina.k@users.invalid');
  await account('omar@users.invalid');

  const search = await (await call('/admin/users?q=AMINA', { token: adminToken })).json();
  assert.equal(search.data.total, 2);
  assert.deepEqual(search.data.items.map((u: { email: string }) => u.email).sort(), [
    'amina.k@users.invalid',
    'amina@users.invalid',
  ]);
  assert.equal(JSON.stringify(search).includes('passwordHash'), false);

  const admins = await (await call('/admin/users?role=admin', { token: adminToken })).json();
  assert.deepEqual(
    admins.data.items.map((u: { email: string }) => u.email),
    ['boss@users.invalid'],
  );

  const page = await (await call('/admin/users?limit=2&page=2', { token: adminToken })).json();
  assert.equal(page.data.items.length, 2);
  assert.equal(page.data.total, 4);

  const bad = await call('/admin/users?status=banned', { token: adminToken });
  assert.equal(bad.status, 400);
});

test('detail shows active sessions; unknown or malformed ids give 404', async () => {
  const { id } = await account('detail@users.invalid');
  await login('detail@users.invalid'); // a second device
  const res = await (await call(`/admin/users/${id}`, { token: adminToken })).json();
  assert.equal(res.data.user.email, 'detail@users.invalid');
  assert.equal(res.data.user.activeSessions, 2);

  assert.equal(
    (await call(`/admin/users/${new Types.ObjectId()}`, { token: adminToken })).status,
    404,
  );
  assert.equal((await call('/admin/users/not-an-id', { token: adminToken })).status, 404);
});

test('End Test: suspending a user blocks their login at once; reactivating restores it', async () => {
  const { id, token } = await account('suspend-me@users.invalid');

  const res = await call(`/admin/users/${id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'suspended' },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.user.status, 'suspended');

  assert.equal((await login('suspend-me@users.invalid')).status, 403, 'cannot log in');
  assert.equal((await call('/me', { token })).status, 403, 'old access token stops working');
  const open = await RefreshToken.countDocuments({ userId: id, revokedAt: null });
  assert.equal(open, 0, 'every session ended');
  const revoked = await RefreshToken.findOne({ userId: id }).lean();
  assert.equal(revoked?.revokedReason, 'admin');

  await call(`/admin/users/${id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'active' },
  });
  assert.equal((await login('suspend-me@users.invalid')).status, 200);

  const logs = await AuditLog.find({ targetId: id }).sort({ createdAt: 1 }).lean();
  assert.deepEqual(
    logs.map((l) => [l.action, l.before, l.after]),
    [
      ['user.suspend', { status: 'active' }, { status: 'suspended' }],
      ['user.reactivate', { status: 'suspended' }, { status: 'active' }],
    ],
  );
  assert.equal(String(logs[0].actorId), adminId);
});

test('role change works both ways and is audited', async () => {
  const { id, token } = await account('promote-me@users.invalid');
  const up = await call(`/admin/users/${id}/role`, {
    method: 'PATCH',
    token: adminToken,
    body: { role: 'admin' },
  });
  assert.equal((await up.json()).data.user.role, 'admin');
  assert.equal((await call('/admin/access', { token })).status, 200, 'the new admin gets in');

  await call(`/admin/users/${id}/role`, {
    method: 'PATCH',
    token: adminToken,
    body: { role: 'user' },
  });
  assert.equal((await call('/admin/access', { token })).status, 403);
  const actions = (await AuditLog.find({ targetId: id }).lean()).map((l) => l.action);
  assert.deepEqual(actions.filter((a) => a === 'user.role_change').length, 2);

  const bad = await call(`/admin/users/${id}/role`, {
    method: 'PATCH',
    token: adminToken,
    body: { role: 'owner' },
  });
  assert.equal(bad.status, 400);
});

test('delete removes the account and its sessions; the audit record remembers who it was', async () => {
  const { id } = await account('delete-me@users.invalid');
  assert.equal(
    (await call(`/admin/users/${id}`, { method: 'DELETE', token: adminToken })).status,
    204,
  );
  assert.equal(await User.exists({ _id: id }), null);
  assert.equal(await RefreshToken.countDocuments({ userId: id }), 0);
  const log = await AuditLog.findOne({ targetId: id, action: 'user.delete' }).lean();
  assert.equal((log?.before as { email: string }).email, 'delete-me@users.invalid');
});

test('an admin cannot suspend, demote or delete their own account', async () => {
  for (const [method, path, body] of [
    ['PATCH', `/admin/users/${adminId}/status`, { status: 'suspended' }],
    ['PATCH', `/admin/users/${adminId}/role`, { role: 'user' }],
    ['DELETE', `/admin/users/${adminId}`, undefined],
  ] as const) {
    const res = await call(path, { method, token: adminToken, body });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error.code, 'CANNOT_CHANGE_SELF');
  }
});

test('the last active admin can never be removed', async () => {
  // Only possible to reach directly (through the API the acting admin always remains).
  await User.deleteMany({ role: 'admin', _id: { $ne: adminId } });
  const fakeOtherActor = { user: { _id: new Types.ObjectId() } } as unknown as Request;
  await assert.rejects(setUserRole(fakeOtherActor, adminId, 'user'), { code: 'LAST_ADMIN' });
  const still = (await User.findById(adminId)) as UserDocument;
  assert.equal(still.role, 'admin');
});

test('a normal user cannot use any user-management route (403)', async () => {
  const { id, token } = await account('nosy@users.invalid');
  assert.equal((await call('/admin/users', { token })).status, 403);
  assert.equal((await call(`/admin/users/${id}`, { method: 'DELETE', token })).status, 403);
});
