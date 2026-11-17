import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import { AUDIT_ACTIONS } from '../src/services/auditLogService.js';
import { promoteToAdmin } from '../src/services/userService.js';

// Own database per run so the newest-first list only holds this file's records.
const DB_NAME = `kobaniq_test_audit_${RUN_ID}`;
const PASSWORD = 'correct-horse-2';

let server: Server;
let baseUrl: string;
let adminToken: string;

const call = (path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
  fetch(`${baseUrl}/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

async function account(email: string, admin = false) {
  await call('/auth/register', { method: 'POST', body: { email, password: PASSWORD } });
  if (admin) await promoteToAdmin(email);
  const body = await (
    await call('/auth/login', { method: 'POST', body: { email, password: PASSWORD } })
  ).json();
  return { id: body.data.user.id as string, token: body.data.accessToken as string };
}

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User.syncIndexes(), RefreshToken.syncIndexes(), AuditLog.syncIndexes()]);
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  adminToken = (await account('boss@audit.invalid', true)).token;

  // Make some history: a denied attempt, a suspend, a role change and a delete.
  const nosy = await account('nosy@audit.invalid');
  await call('/admin/users', { token: nosy.token });
  await call(`/admin/users/${nosy.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'suspended' },
  });
  const helper = await account('helper@audit.invalid');
  await call(`/admin/users/${helper.id}/role`, {
    method: 'PATCH',
    token: adminToken,
    body: { role: 'admin' },
  });
  const gone = await account('gone@audit.invalid');
  await call(`/admin/users/${gone.id}`, { method: 'DELETE', token: adminToken });
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('lists every record newest first, with who, what, target and before/after', async () => {
  const res = await call('/admin/audit-logs', { token: adminToken });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.total, 4);
  assert.deepEqual(
    body.data.items.map((i: { action: string }) => i.action),
    ['user.delete', 'user.role_change', 'user.suspend', 'admin.access_denied'],
  );

  const [deleted, roleChange, suspend, denied] = body.data.items;
  assert.equal(deleted.actor, 'boss@audit.invalid');
  assert.equal(deleted.target, 'gone@audit.invalid', 'a deleted user still shows by email');
  assert.deepEqual(roleChange.before, { role: 'user' });
  assert.deepEqual(roleChange.after, { role: 'admin' });
  assert.equal(roleChange.target, 'helper@audit.invalid');
  assert.deepEqual(suspend.after, { status: 'suspended' });
  assert.equal(denied.actor, 'nosy@audit.invalid');
  assert.equal(denied.target, 'GET /api/v1/admin/users');
});

test('filters by action and pages through results', async () => {
  const only = await (
    await call('/admin/audit-logs?action=user.suspend', { token: adminToken })
  ).json();
  assert.deepEqual(
    only.data.items.map((i: { action: string }) => i.action),
    ['user.suspend'],
  );

  const page2 = await (
    await call('/admin/audit-logs?limit=3&page=2', { token: adminToken })
  ).json();
  assert.equal(page2.data.items.length, 1);
  assert.equal(page2.data.items[0].action, 'admin.access_denied');

  const bad = await call('/admin/audit-logs?action=user.hack', { token: adminToken });
  assert.equal(bad.status, 400);
});

test('only admins can read the audit log', async () => {
  const { token } = await account('reader@audit.invalid');
  assert.equal((await call('/admin/audit-logs', { token })).status, 403);
});

test('every action the code writes is in the filter list', () => {
  const srcDir = join(__dirname, '..', 'src');
  const code = readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.ts'))
    .map((f) => readFileSync(join(f.parentPath, f.name), 'utf8'))
    .join('\n');
  // Every 'word.word' text on a line that sets `action:` (also both sides of `a ? b : c`).
  const written = new Set(
    code
      .split('\n')
      .filter((line) => /\baction:\s/.test(line))
      .flatMap((line) => [...line.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map((m) => m[1])),
  );
  assert.ok(written.size >= 5, `found ${[...written].join(', ')}`);
  for (const action of written) {
    assert.ok(
      (AUDIT_ACTIONS as readonly string[]).includes(action),
      `${action} missing from AUDIT_ACTIONS`,
    );
  }
});
