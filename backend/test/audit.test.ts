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
const DOMAIN = '@audit-test.kobaniq.invalid';
const DOMAIN_RE = /@audit-test\.kobaniq\.invalid$/;
const PASSWORD = 'correct-horse-3';

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
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'User-Agent': 'audit-test-agent',
    },
  });

async function signIn(name: string, admin = false) {
  const email = `${name}-${Date.now()}${DOMAIN}`;
  assert.equal((await post('/auth/register', { email, password: PASSWORD })).status, 201);
  if (admin) await promoteToAdmin(email);
  const body = await (await post('/auth/login', { email, password: PASSWORD })).json();
  return { id: body.data.user.id as string, token: body.data.accessToken as string };
}

before(async () => {
  await connectDB({ dbName: 'kobaniq_test', retries: 2 });
  await Promise.all([User.syncIndexes(), RefreshToken.syncIndexes(), AuditLog.syncIndexes()]);
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

test('a non-admin trying an admin route is logged in auditLogs', async () => {
  const { id, token } = await signIn('job-seeker');
  assert.equal((await adminAccess(token)).status, 403);

  const logs = await AuditLog.find({ actorId: id }).lean();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'admin.access_denied');
  assert.equal(logs[0].targetType, 'route');
  assert.equal(logs[0].targetId, 'GET /api/v1/admin/access');
  assert.equal(logs[0].userAgent, 'audit-test-agent');
  assert.ok(logs[0].ip, 'ip is recorded');
  assert.ok(logs[0].createdAt instanceof Date, 'time is recorded');
});

test('every attempt gets its own record', async () => {
  const { id, token } = await signIn('repeat');
  await adminAccess(token);
  await adminAccess(token);
  assert.equal(await AuditLog.countDocuments({ actorId: id }), 2);
});

test('an admin using an admin route is not logged as denied', async () => {
  const { id, token } = await signIn('admin', true);
  assert.equal((await adminAccess(token)).status, 200);
  assert.equal(await AuditLog.countDocuments({ actorId: id }), 0);
});

test('a request without a token is rejected before the role check (nothing to log)', async () => {
  const before = await AuditLog.estimatedDocumentCount();
  assert.equal((await adminAccess()).status, 401);
  assert.equal(await AuditLog.estimatedDocumentCount(), before);
});
