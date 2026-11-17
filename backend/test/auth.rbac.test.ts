import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import { promoteToAdmin } from '../src/services/userService.js';

// Every account made here uses this domain so cleanup never touches real users.
const DOMAIN = '@rbac-test.kobaniq.invalid';
const DOMAIN_RE = /@rbac-test\.kobaniq\.invalid$/;
const PASSWORD = 'correct-horse-5';

let server: Server;
let baseUrl: string;

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const adminAccess = (token?: string) =>
  fetch(`${baseUrl}/api/v1/admin/access`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

/** Registers a fresh user (optionally promoted to admin) and returns its access token. */
async function signIn(name: string, admin = false) {
  const email = `${name}-${Date.now()}${DOMAIN}`;
  assert.equal((await post('/auth/register', { email, password: PASSWORD })).status, 201);
  if (admin) await promoteToAdmin(email);
  const res = await post('/auth/login', { email, password: PASSWORD });
  return { email, token: (await res.json()).data.accessToken as string };
}

before(async () => {
  await connectDB({ dbName: 'kobaniq_test', retries: 2 });
  await Promise.all([User.syncIndexes(), RefreshToken.syncIndexes()]);
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  const ids = (await User.find({ email: DOMAIN_RE }, { _id: 1 }).lean()).map((u) => u._id);
  await RefreshToken.deleteMany({ userId: { $in: ids } });
  await AuditLog.deleteMany({ actorId: { $in: ids } });
  await User.deleteMany({ email: DOMAIN_RE });
  server.close();
  await disconnectDB();
});

test('a `user` calling an admin route gets 403 FORBIDDEN', async () => {
  const { token } = await signIn('user');
  const res = await adminAccess(token);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'FORBIDDEN');
});

test('an admin gets 200 on the admin route', async () => {
  const { email, token } = await signIn('admin', true);
  const res = await adminAccess(token);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.access, true);
  assert.equal(body.data.user.email, email);
  assert.equal(body.data.user.role, 'admin');
});

test('admin routes without a token return 401 (not 403)', async () => {
  const res = await adminAccess();
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'AUTH_REQUIRED');
});

test('a role change works at once, even with an older token', async () => {
  const { email, token } = await signIn('promoted-later');
  assert.equal((await adminAccess(token)).status, 403);
  await promoteToAdmin(email);
  assert.equal((await adminAccess(token)).status, 200, 'same token, new role');
  await User.updateOne({ email }, { role: 'user' });
  assert.equal((await adminAccess(token)).status, 403, 'demotion also works at once');
});

test('promoteToAdmin fails clearly for an unknown email', async () => {
  await assert.rejects(promoteToAdmin(`nobody${DOMAIN}`), { code: 'USER_NOT_FOUND' });
});
