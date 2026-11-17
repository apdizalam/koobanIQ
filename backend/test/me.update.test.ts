import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { testDomain } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';

// Every account made here uses this run's own domain, so cleanup never touches real
// users or another test run's users.
const { DOMAIN, DOMAIN_RE } = testDomain('me-update');
const PASSWORD = 'correct-horse-8';

let server: Server;
let baseUrl: string;

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const patchMe = (token: string, body: unknown) =>
  fetch(`${baseUrl}/api/v1/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

async function signIn(name: string) {
  const email = `${name}-${Date.now()}${DOMAIN}`;
  assert.equal((await post('/auth/register', { email, password: PASSWORD })).status, 201);
  const body = await (await post('/auth/login', { email, password: PASSWORD })).json();
  return { email, token: body.data.accessToken as string };
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
  await User.deleteMany({ email: DOMAIN_RE });
  server.close();
  await disconnectDB();
});

test('PATCH /me saves preferredLanguage, and it survives a new login', async () => {
  const { email, token } = await signIn('lang');
  const res = await patchMe(token, { preferredLanguage: 'so' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.user.preferredLanguage, 'so');

  // "Another device": a fresh login returns the saved language.
  const again = await (await post('/auth/login', { email, password: PASSWORD })).json();
  assert.equal(again.data.user.preferredLanguage, 'so');
});

test('only "en" or "so" is accepted', async () => {
  const { token } = await signIn('bad-lang');
  const res = await patchMe(token, { preferredLanguage: 'fr' });
  assert.equal(res.status, 400);
  assert.deepEqual(Object.keys((await res.json()).meta.details), ['preferredLanguage']);
});

test('role, status and other fields cannot be changed through PATCH /me', async () => {
  const { email, token } = await signIn('sneaky');
  const res = await patchMe(token, { preferredLanguage: 'so', role: 'admin', status: 'active' });
  assert.equal(res.status, 400);
  assert.deepEqual(Object.keys((await res.json()).meta.details).sort(), ['role', 'status']);
  const stored = await User.findOne({ email }).lean();
  assert.equal(stored?.role, 'user');
  assert.equal(stored?.preferredLanguage, 'en', 'nothing is saved when the request is refused');
});

test('an empty body is refused and PATCH /me needs a token', async () => {
  const { token } = await signIn('empty');
  assert.equal((await patchMe(token, {})).status, 400);
  const noToken = await fetch(`${baseUrl}/api/v1/me`, { method: 'PATCH' });
  assert.equal(noToken.status, 401);
});
