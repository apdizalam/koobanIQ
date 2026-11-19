import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { testDomain } from './support/testRun.js';
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { hashToken } from '../src/lib/tokens.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';

// Every account made here uses this run's own domain, so cleanup never touches real
// users or another test run's users.
const { DOMAIN, DOMAIN_RE } = testDomain('login');
const PASSWORD = 'correct-horse-9';

let server: Server;
let baseUrl: string;

const post = (path: string, body: unknown) =>
  fetch(`${baseUrl}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const getMe = (token?: string) =>
  fetch(`${baseUrl}/api/v1/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

async function newUser(name: string) {
  const email = `${name}-${Date.now()}${DOMAIN}`;
  const res = await post('/auth/register', { email, password: PASSWORD, ageConfirmed: true });
  assert.equal(res.status, 201);
  return email;
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

test('login returns the user, a 15-minute access token and a refresh token', async () => {
  const email = await newUser('login');
  const res = await post('/auth/login', { email: email.toUpperCase(), password: PASSWORD });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.user.email, email);
  assert.equal('passwordHash' in body.data.user, false);
  assert.equal(body.data.accessTokenExpiresIn, 15 * 60);
  assert.equal(typeof body.data.refreshToken, 'string');

  const days = (new Date(body.data.refreshTokenExpiresAt).getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 29.9 && days <= 30, `refresh token lasts 30 days (got ${days})`);

  const claims = jwt.verify(body.data.accessToken, env.jwtAccessSecret) as jwt.JwtPayload;
  assert.equal(claims.sub, body.data.user.id);
  assert.equal(claims.role, 'user');
});

test('the refresh token is stored only as a hash', async () => {
  const email = await newUser('hash');
  const body = await (await post('/auth/login', { email, password: PASSWORD })).json();
  const { refreshToken } = body.data;

  assert.equal(await RefreshToken.exists({ tokenHash: refreshToken }), null);
  const stored = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) }).lean();
  assert.equal(String(stored?.userId), body.data.user.id);
});

test('wrong password and unknown email give the same 401', async () => {
  const email = await newUser('wrong');
  const wrongPassword = await post('/auth/login', { email, password: 'not-the-password' });
  const unknownEmail = await post('/auth/login', { email: `nobody${DOMAIN}`, password: PASSWORD });

  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.deepEqual((await wrongPassword.json()).error, (await unknownEmail.json()).error);
});

test('login with missing fields returns 400', async () => {
  const res = await post('/auth/login', {});
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.deepEqual(Object.keys(body.meta.details).sort(), ['email', 'password']);
});

test('a suspended account cannot log in (403)', async () => {
  const email = await newUser('suspended');
  await User.updateOne({ email }, { status: 'suspended' });
  const res = await post('/auth/login', { email, password: PASSWORD });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'ACCOUNT_SUSPENDED');
});

test('GET /me returns the signed-in user with a valid access token', async () => {
  const email = await newUser('me');
  const login = await (await post('/auth/login', { email, password: PASSWORD })).json();
  const res = await getMe(login.data.accessToken);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.user.email, email);
  assert.equal(body.data.user.preferredLanguage, 'en');
});

test('GET /me without a token returns 401 AUTH_REQUIRED', async () => {
  const res = await getMe();
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'AUTH_REQUIRED');
});

test('GET /me with an invalid or forged token returns 401 INVALID_TOKEN', async () => {
  const forged = jwt.sign({ role: 'admin' }, 'not-the-server-secret', { subject: 'x' });
  for (const token of ['garbage', forged]) {
    const res = await getMe(token);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, 'INVALID_TOKEN');
  }
});

test('GET /me with an expired token returns 401 TOKEN_EXPIRED', async () => {
  const email = await newUser('expired');
  const user = await User.findOne({ email }).lean();
  const expired = jwt.sign({ role: 'user' }, env.jwtAccessSecret, {
    subject: String(user!._id),
    expiresIn: -10,
  });
  const res = await getMe(expired);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, 'TOKEN_EXPIRED');
});
