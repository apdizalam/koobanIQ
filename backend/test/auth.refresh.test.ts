import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { testDomain } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { hashToken } from '../src/lib/tokens.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';

// Every account made here uses this run's own domain, so cleanup never touches real
// users or another test run's users.
const { DOMAIN, DOMAIN_RE } = testDomain('refresh');
const PASSWORD = 'correct-horse-7';

let server: Server;
let baseUrl: string;

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const getMe = (token: string) =>
  fetch(`${baseUrl}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` } });

/** Registers a fresh user and logs in; returns the login data. */
async function signIn(name: string) {
  const email = `${name}-${Date.now()}${DOMAIN}`;
  assert.equal((await post('/auth/register', { email, password: PASSWORD })).status, 201);
  const res = await post('/auth/login', { email, password: PASSWORD });
  assert.equal(res.status, 200);
  return { email, ...(await res.json()).data };
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

test('End Test flow: register -> login -> refresh -> logout', async () => {
  const session = await signIn('flow');

  const res = await post('/auth/refresh', { refreshToken: session.refreshToken });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.user.email, session.email);
  assert.notEqual(body.data.refreshToken, session.refreshToken, 'a new refresh token is issued');
  assert.equal((await getMe(body.data.accessToken)).status, 200, 'new access token works');

  const out = await post('/auth/logout', { refreshToken: body.data.refreshToken });
  assert.equal(out.status, 204);

  const after = await post('/auth/refresh', { refreshToken: body.data.refreshToken });
  assert.equal(after.status, 401);
  assert.equal((await after.json()).error.code, 'INVALID_REFRESH_TOKEN');
});

test('a refresh token works only once (rotation)', async () => {
  const session = await signIn('rotate');
  assert.equal((await post('/auth/refresh', { refreshToken: session.refreshToken })).status, 200);
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(session.refreshToken) }).lean();
  assert.equal(stored?.revokedReason, 'rotated');
});

test('reusing an old refresh token ends every session of that user', async () => {
  const session = await signIn('reuse');
  const first = await (await post('/auth/refresh', { refreshToken: session.refreshToken })).json();

  const replay = await post('/auth/refresh', { refreshToken: session.refreshToken });
  assert.equal(replay.status, 401);
  assert.equal((await replay.json()).error.code, 'REFRESH_TOKEN_REUSED');

  // The newer token from the same user no longer works either.
  const newer = await post('/auth/refresh', { refreshToken: first.data.refreshToken });
  assert.equal(newer.status, 401);
});

test('a logged-out token does not end the user’s other sessions', async () => {
  const phone = await signIn('two-devices');
  const laptop = await (
    await post('/auth/login', { email: phone.email, password: PASSWORD })
  ).json();

  assert.equal((await post('/auth/logout', { refreshToken: phone.refreshToken })).status, 204);
  assert.equal((await post('/auth/refresh', { refreshToken: phone.refreshToken })).status, 401);
  // The laptop session is untouched.
  assert.equal(
    (await post('/auth/refresh', { refreshToken: laptop.data.refreshToken })).status,
    200,
  );
});

test('an expired refresh token returns 401', async () => {
  const session = await signIn('expired');
  await RefreshToken.updateOne(
    { tokenHash: hashToken(session.refreshToken) },
    { expiresAt: new Date(Date.now() - 1000) },
  );
  const res = await post('/auth/refresh', { refreshToken: session.refreshToken });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'INVALID_REFRESH_TOKEN');
});

test('an unknown refresh token returns 401 and a missing one returns 400', async () => {
  const unknown = await post('/auth/refresh', { refreshToken: 'not-a-real-token' });
  assert.equal(unknown.status, 401);
  assert.equal((await unknown.json()).error.code, 'INVALID_REFRESH_TOKEN');

  const missing = await post('/auth/refresh', {});
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error.code, 'VALIDATION_ERROR');
});

test('logging out twice is harmless (204 both times)', async () => {
  const session = await signIn('twice');
  assert.equal((await post('/auth/logout', { refreshToken: session.refreshToken })).status, 204);
  assert.equal((await post('/auth/logout', { refreshToken: session.refreshToken })).status, 204);
});

test('a suspended user cannot refresh (403)', async () => {
  const session = await signIn('suspended');
  await User.updateOne({ email: session.email }, { status: 'suspended' });
  const res = await post('/auth/refresh', { refreshToken: session.refreshToken });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'ACCOUNT_SUSPENDED');
});
