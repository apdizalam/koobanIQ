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
import { promoteToAdmin } from '../src/services/userService.js';
import { RUN_ID } from './support/testRun.js';

// Own database per run (dropped at the end). Clearly fake accounts only.
// KOBANIQ has two roles, user and admin: the existing admin role manages these settings.
const DB_NAME = `kobaniq_test_privacy_${RUN_ID}`;
const PASSWORD = 'correct-horse-13';
const PATH = '/admin/settings/ai-personal-data';
const REASON = 'Moved to the paid AI tier; privacy terms checked by the owner.';

let server: Server;
let baseUrl: string;
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
  await call(null, 'POST', '/auth/register', { email, password: PASSWORD, ageConfirmed: true });
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

  // No extra role or flag: the admin answer is the same as before.
  const access = await call(admin, 'GET', '/admin/access');
  assert.equal(access.status, 200);
  assert.equal('superAdmin' in access.body.data, false);
});

test('ordinary users cannot change it, even calling the API directly; refused attempts are audited', async () => {
  const byUser = await call(user, 'PUT', PATH, { value: 'allowed', reason: REASON });
  assert.equal(byUser.status, 403);
  assert.equal(byUser.body.error.code, 'FORBIDDEN');
  assert.ok(
    await AuditLog.findOne({ action: 'admin.access_denied', targetId: `PUT /api/v1${PATH}` }),
    'refused attempt is audited',
  );
  assert.equal((await call(null, 'PUT', PATH, { value: 'allowed', reason: REASON })).status, 401);
  assert.equal(await aiPersonalDataValue(), 'blocked');
});

test('an admin must give a valid value and a reason', async () => {
  const noReason = await call(admin, 'PUT', PATH, { value: 'allowed' });
  assert.equal(noReason.status, 400);
  assert.equal(noReason.body.meta.details.reason, 'Give a reason (10 to 500 characters)');
  for (const body of [
    { value: 'allowed', reason: 'too short' },
    { value: 'allowed', reason: 'x'.repeat(501) },
    { value: 'allowed', reason: 42 },
    { value: 'maybe', reason: REASON },
    { value: 'allowed', reason: REASON, extra: 1 },
  ]) {
    assert.equal((await call(admin, 'PUT', PATH, body)).status, 400, JSON.stringify(body));
  }
  assert.equal(await aiPersonalDataValue(), 'blocked');
});

test('an admin changes it: admin id, time, previous value, new value and reason are recorded', async () => {
  const startedAt = Date.now();
  const res = await call(admin, 'PUT', PATH, { value: 'allowed', reason: REASON });
  assert.equal(res.status, 200);
  const setting = res.body.data.setting;
  assert.equal(setting.value, 'allowed');
  assert.equal(setting.isDefault, false);
  assert.equal(setting.history.length, 1);
  const change = setting.history[0];
  assert.equal(change.value, 'allowed');
  assert.equal(change.previous, 'blocked');
  assert.equal(change.admin, 'staff@privacy.invalid');
  assert.equal(change.adminId, await idOf('staff@privacy.invalid'));
  assert.equal(change.reason, REASON);
  assert.ok(Date.parse(change.at) >= startedAt - 1000);
  assert.equal(await aiPersonalDataValue(), 'allowed', 'the backend uses it at once');

  const audit = await AuditLog.findOne({ action: 'settings.ai_personal_data' }).lean();
  assert.equal(String(audit?.actorId), await idOf('staff@privacy.invalid'));
  assert.equal(audit?.reason, REASON);
  assert.deepEqual(audit?.before, { value: 'blocked' });
  assert.deepEqual(audit?.after, { value: 'allowed' });
  const logs = await call(admin, 'GET', '/admin/audit-logs?action=settings.ai_personal_data');
  assert.equal(logs.body.data.items[0].reason, REASON, 'reason shown in the audit log');

  const same = await call(admin, 'PUT', PATH, { value: 'allowed', reason: REASON });
  assert.equal(same.status, 409);
  assert.equal(same.body.error.code, 'SETTING_UNCHANGED');

  const back = await call(admin, 'PUT', PATH, {
    value: 'blocked',
    reason: 'Back to blocked until the next privacy review.',
  });
  assert.equal(back.status, 200);
  assert.deepEqual(
    back.body.data.setting.history.map((h: Json) => `${h.previous}→${h.value}`),
    ['allowed→blocked', 'blocked→allowed'],
    'newest first',
  );
  assert.equal((await call(admin, 'GET', PATH)).body.data.setting.history.length, 2);
  assert.equal(await aiPersonalDataValue(), 'blocked');
});

test('test accounts: an admin marks them with a reason; audited; users cannot', async () => {
  const id = await idOf('amina@privacy.invalid');
  const path = `/admin/users/${id}/test-account`;
  const reason = 'Account used by the team for fictional CV tests.';

  const byUser = await call(user, 'PATCH', path, { testAccount: true, reason });
  assert.equal(byUser.status, 403);
  assert.equal(byUser.body.error.code, 'FORBIDDEN');
  assert.equal((await call(admin, 'PATCH', path, { testAccount: true })).status, 400);
  assert.equal((await call(admin, 'PATCH', path, { testAccount: 'yes', reason })).status, 400);
  assert.equal(
    (await call(admin, 'PATCH', path, { testAccount: true, reason, role: 'admin' })).status,
    400,
  );
  assert.equal((await User.findById(id))?.testAccount, false);

  const marked = await call(admin, 'PATCH', path, { testAccount: true, reason });
  assert.equal(marked.status, 200);
  assert.equal(marked.body.data.user.testAccount, true);
  assert.equal((await User.findById(id))?.testAccount, true);
  const audit = await AuditLog.findOne({ action: 'user.test_account', targetId: id }).lean();
  assert.equal(String(audit?.actorId), await idOf('staff@privacy.invalid'));
  assert.equal(audit?.reason, reason);
  assert.deepEqual(audit?.before, { testAccount: false });
  assert.deepEqual(audit?.after, { testAccount: true });

  const listed = await call(admin, 'GET', '/admin/users?q=amina');
  assert.equal(listed.body.data.items[0].testAccount, true, 'admins can see the mark');

  const unmarked = await call(admin, 'PATCH', path, {
    testAccount: false,
    reason: 'Tests finished; back to a normal account.',
  });
  assert.equal(unmarked.body.data.user.testAccount, false);
  assert.equal(await AuditLog.countDocuments({ action: 'user.test_account', targetId: id }), 2);

  // A user can never set it on their own account.
  const self = await call(user, 'PATCH', '/me', { testAccount: true });
  assert.equal(self.status, 400);
  assert.equal((await User.findById(id))?.testAccount, false);
});

test('email domains never make a test account', async () => {
  await account('tester@example.com');
  await account('qa@privacy.invalid');
  for (const email of ['tester@example.com', 'qa@privacy.invalid']) {
    assert.equal((await User.findOne({ email }))?.testAccount, false, email);
  }
});
