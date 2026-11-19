import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { Setting } from '../src/models/Setting.js';
import { User } from '../src/models/User.js';
import { aiPersonalDataValue } from '../src/services/settingsService.js';
import { promoteToAdmin, promoteToSuperAdmin } from '../src/services/userService.js';
import { RUN_ID } from './support/testRun.js';

// Own database per run (dropped at the end). Clearly fake accounts only.
const DB_NAME = `kobaniq_test_privacy_${RUN_ID}`;
const PASSWORD = 'correct-horse-13';
const PATH = '/admin/settings/ai-personal-data';
const REASON = 'Moved to the paid AI tier; privacy terms checked by the owner.';

let server: Server;
let baseUrl: string;
let superAdmin: string;
let admin: string;
let user: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads any answer
type Json = any;

async function call(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json };
}

async function account(email: string) {
  await call(null, 'POST', '/auth/register', { email, password: PASSWORD });
  return (await call(null, 'POST', '/auth/login', { email, password: PASSWORD })).body.data
    .accessToken as string;
}

const idOf = async (email: string) => String((await User.findOne({ email }))!._id);

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User, RefreshToken, AuditLog, Setting].map((m) => m.syncIndexes()));
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  superAdmin = await account('owner@privacy.invalid');
  await promoteToAdmin('owner@privacy.invalid');
  await promoteToSuperAdmin('owner@privacy.invalid');
  admin = await account('staff@privacy.invalid');
  await promoteToAdmin('staff@privacy.invalid');
  user = await account('amina@privacy.invalid');
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('default is BLOCKED (nothing stored); admins can view it, users cannot', async () => {
  assert.equal(await aiPersonalDataValue(), 'blocked');
  const view = await call(admin, 'GET', PATH);
  assert.equal(view.status, 200);
  assert.deepEqual(view.body.data.setting, { value: 'blocked', isDefault: true, history: [] });
  assert.equal((await call(user, 'GET', PATH)).status, 403);
  assert.equal((await call(null, 'GET', PATH)).status, 401);

  const access = await call(superAdmin, 'GET', '/admin/access');
  assert.equal(access.body.data.superAdmin, true);
  assert.equal((await call(admin, 'GET', '/admin/access')).body.data.superAdmin, false);
});

test('normal admins and users cannot change it, even calling the API directly', async () => {
  const byAdmin = await call(admin, 'PUT', PATH, { value: 'allowed', reason: REASON });
  assert.equal(byAdmin.status, 403);
  assert.equal(byAdmin.body.error.code, 'SUPER_ADMIN_REQUIRED');
  assert.ok(
    await AuditLog.findOne({ action: 'admin.access_denied', targetId: `PUT /api/v1${PATH}` }),
    'refused attempt is audited',
  );
  assert.equal((await call(user, 'PUT', PATH, { value: 'allowed', reason: REASON })).status, 403);
  assert.equal(await aiPersonalDataValue(), 'blocked');
});

test('a super admin must give a valid value and a reason', async () => {
  const noReason = await call(superAdmin, 'PUT', PATH, { value: 'allowed' });
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.meta.details.reason, 'Give a reason (10 to 500 characters)');
  assert.equal(
    (await call(superAdmin, 'PUT', PATH, { value: 'allowed', reason: 'too short' })).status,
    400,
  );
  assert.equal(
    (await call(superAdmin, 'PUT', PATH, { value: 'maybe', reason: REASON })).status,
    400,
  );
  assert.equal(
    (await call(superAdmin, 'PUT', PATH, { value: 'allowed', reason: REASON, extra: 1 })).status,
    400,
  );
  assert.equal(await aiPersonalDataValue(), 'blocked');
});

test('a super admin changes it: admin id, time and reason are recorded with the change', async () => {
  const before = Date.now();
  const res = await call(superAdmin, 'PUT', PATH, { value: 'allowed', reason: REASON });
  assert.equal(res.status, 200);
  const setting = res.body.data.setting;
  assert.equal(setting.value, 'allowed');
  assert.equal(setting.isDefault, false);
  assert.equal(setting.history.length, 1);
  const change = setting.history[0];
  assert.equal(change.value, 'allowed');
  assert.equal(change.previous, 'blocked');
  assert.equal(change.admin, 'owner@privacy.invalid');
  assert.equal(change.adminId, await idOf('owner@privacy.invalid'));
  assert.equal(change.reason, REASON);
  assert.ok(Date.parse(change.at) >= before - 1000);
  assert.equal(await aiPersonalDataValue(), 'allowed', 'the backend uses it at once');

  const audit = await AuditLog.findOne({ action: 'settings.ai_personal_data' }).lean();
  assert.equal(String(audit?.actorId), await idOf('owner@privacy.invalid'));
  assert.equal(audit?.reason, REASON);
  assert.deepEqual(audit?.before, { value: 'blocked' });
  assert.deepEqual(audit?.after, { value: 'allowed' });
  const logs = await call(admin, 'GET', '/admin/audit-logs?action=settings.ai_personal_data');
  assert.equal(logs.body.data.items[0].reason, REASON, 'reason shown in the audit log');

  const same = await call(superAdmin, 'PUT', PATH, { value: 'allowed', reason: REASON });
  assert.equal(same.status, 409);
  assert.equal(same.body.error.code, 'SETTING_UNCHANGED');

  const back = await call(superAdmin, 'PUT', PATH, {
    value: 'blocked',
    reason: 'Back to blocked until the next privacy review.',
  });
  assert.deepEqual(
    back.body.data.setting.history.map((h: Json) => `${h.previous}→${h.value}`),
    ['allowed→blocked', 'blocked→allowed'],
    'newest first',
  );
  assert.equal(await aiPersonalDataValue(), 'blocked');
});

test('test accounts: only a super admin can mark them, with a reason; audited', async () => {
  const id = await idOf('amina@privacy.invalid');
  const path = `/admin/users/${id}/test-account`;
  const reason = 'Account used by the team for fictional CV tests.';

  const byAdmin = await call(admin, 'PATCH', path, { testAccount: true, reason });
  assert.equal(byAdmin.status, 403);
  assert.equal(byAdmin.body.error.code, 'SUPER_ADMIN_REQUIRED');
  assert.equal((await call(superAdmin, 'PATCH', path, { testAccount: true })).status, 400);
  assert.equal((await call(superAdmin, 'PATCH', path, { testAccount: 'yes', reason })).status, 400);

  const marked = await call(superAdmin, 'PATCH', path, { testAccount: true, reason });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.data.user.testAccount, true);
  assert.equal((await User.findById(id))?.testAccount, true);
  const audit = await AuditLog.findOne({ action: 'user.test_account', targetId: id }).lean();
  assert.equal(audit?.reason, reason);
  assert.deepEqual(audit?.after, { testAccount: true });

  const listed = await call(admin, 'GET', '/admin/users?q=amina');
  assert.equal(listed.body.data.items[0].testAccount, true, 'admins can see the mark');

  // A user can never set it (or super admin) on their own account.
  const self = await call(user, 'PATCH', '/me', { testAccount: false, superAdmin: true });
  assert.equal(self.status, 400);
  assert.equal((await User.findById(id))?.superAdmin, false);
});

test('normal admins cannot suspend, demote or delete a super admin', async () => {
  const ownerId = await idOf('owner@privacy.invalid');
  for (const [method, path, body] of [
    ['PATCH', `/admin/users/${ownerId}/status`, { status: 'suspended' }],
    ['PATCH', `/admin/users/${ownerId}/role`, { role: 'user' }],
    ['DELETE', `/admin/users/${ownerId}`, undefined],
  ] as const) {
    const res = await call(admin, method, path, body);
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.equal(res.body.error.code, 'SUPER_ADMIN_REQUIRED');
  }
  const owner = await User.findById(ownerId);
  assert.equal(owner?.role, 'admin');
  assert.equal(owner?.superAdmin, true);
  assert.equal(owner?.status, 'active');
});

test('super admin rights come only from the server command, and end with the admin role', async () => {
  await account('second@privacy.invalid');
  await assert.rejects(promoteToSuperAdmin('second@privacy.invalid'), /No admin account/);
  await promoteToAdmin('second@privacy.invalid');
  await promoteToSuperAdmin('second@privacy.invalid');
  const secondId = await idOf('second@privacy.invalid');

  // Another super admin demotes them: the super admin flag goes too.
  const res = await call(superAdmin, 'PATCH', `/admin/users/${secondId}/role`, { role: 'user' });
  assert.equal(res.status, 200);
  const second = await User.findById(secondId);
  assert.equal(second?.role, 'user');
  assert.equal(second?.superAdmin, false);
});
