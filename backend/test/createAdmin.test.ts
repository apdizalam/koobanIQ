import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import { ensureAdminAccount } from '../src/services/userService.js';
import { testDomain } from './support/testRun.js';

/** TIQ-25: `npm run admin:create` makes the first admin of a new database (e.g. staging). */
const { DOMAIN, DOMAIN_RE } = testDomain('createadmin');
const PASSWORD = 'long-enough-admin-pw-1';

let server: Server;
let baseUrl: string;

const login = (email: string, password: string) =>
  fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

async function adminAccess(email: string, password: string) {
  const res = await login(email, password);
  if (res.status !== 200) return res.status;
  const { data } = await res.json();
  const access = await fetch(`${baseUrl}/api/v1/admin/access`, {
    headers: { Authorization: `Bearer ${data.accessToken}` },
  });
  return access.status;
}

before(async () => {
  await connectDB({ dbName: 'kobaniq_test', retries: 2 });
  await Promise.all([User.syncIndexes(), RefreshToken.syncIndexes()]);
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  const users = await User.find({ email: DOMAIN_RE }, { _id: 1 }).lean();
  await RefreshToken.deleteMany({ userId: { $in: users.map((u) => u._id) } });
  await User.deleteMany({ email: DOMAIN_RE });
  server.close();
  await disconnectDB();
});

test('creates a new admin who can sign in and open the admin area', async () => {
  const email = `First-Admin-${Date.now()}${DOMAIN}`;
  const result = await ensureAdminAccount({ email: `  ${email} `, password: PASSWORD });
  assert.equal(result.action, 'created');
  assert.equal(result.user.role, 'admin');
  assert.equal(result.user.emailVerified, true);
  assert.equal(JSON.stringify(result).includes(PASSWORD), false);
  assert.equal(await adminAccess(email.toLowerCase(), PASSWORD), 200);
});

test('running it again changes nothing: one account, same password', async () => {
  const email = `again-${Date.now()}${DOMAIN}`;
  await ensureAdminAccount({ email, password: PASSWORD });
  const second = await ensureAdminAccount({ email, password: 'a-different-password-2' });
  assert.equal(second.action, 'promoted');
  assert.equal(await User.countDocuments({ email }), 1);
  assert.equal(await adminAccess(email, PASSWORD), 200);
  assert.equal(await adminAccess(email, 'a-different-password-2'), 401);
});

test('an existing regular account becomes admin; the password is replaced only on request', async () => {
  const email = `regular-${Date.now()}${DOMAIN}`;
  const reg = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'user-password-1', ageConfirmed: true }),
  });
  assert.equal(reg.status, 201);
  assert.equal(await adminAccess(email, 'user-password-1'), 403);

  const promoted = await ensureAdminAccount({ email, password: PASSWORD });
  assert.equal(promoted.action, 'promoted');
  assert.equal(await adminAccess(email, 'user-password-1'), 200);

  const reset = await ensureAdminAccount({ email, password: PASSWORD, resetPassword: true });
  assert.equal(reset.action, 'promoted, password reset');
  assert.equal(await adminAccess(email, PASSWORD), 200);
  assert.equal(await adminAccess(email, 'user-password-1'), 401);
});

test('refuses a bad email or a short password, and creates nothing', async () => {
  await assert.rejects(ensureAdminAccount({ email: 'not-an-email', password: PASSWORD }), /email/);
  const email = `short-${Date.now()}${DOMAIN}`;
  await assert.rejects(ensureAdminAccount({ email, password: 'short-pw-1' }), /12/);
  assert.equal(await User.countDocuments({ email }), 0);
});
