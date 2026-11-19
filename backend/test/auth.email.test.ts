import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { testDomain } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { outbox } from '../src/lib/mailer.js';
import { EmailCode } from '../src/models/EmailCode.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import { MAX_CODE_ATTEMPTS } from '../src/services/emailCodeService.js';

// Every account made here uses this run's own domain, so cleanup never touches real
// users or another test run's users.
const { DOMAIN, DOMAIN_RE } = testDomain('email');
let counter = 0;
const email = (name: string) => `${name}-${Date.now()}-${counter++}${DOMAIN}`;
const PASSWORD = 'correct-horse-7';
const NEW_PASSWORD = 'battery-staple-9';

let server: Server;
let baseUrl: string;

/** The API envelope fields these tests read. */
interface ApiBody {
  data: { user?: { emailVerified: boolean }; refreshToken?: string } | null;
  error: { code: string; message: string } | null;
  meta: { details?: Record<string, string> };
}

const call = async (
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: ApiBody }> => {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const parsed: ApiBody = text ? JSON.parse(text) : { data: null, error: null, meta: {} };
  return { status: res.status, body: parsed };
};

/** The 6-digit code in the latest email sent to `to`. */
function lastCode(to: string): string {
  const message = [...outbox].reverse().find((m) => m.to === to.toLowerCase());
  assert.ok(message, `no email was sent to ${to}`);
  const match = /\b(\d{6})\b/.exec(message.text);
  assert.ok(match, 'the email contains a 6-digit code');
  return match[1];
}
const emailsTo = (to: string) => outbox.filter((m) => m.to === to.toLowerCase());

const register = (address: string, preferredLanguage = 'en') =>
  call('/auth/register', {
    email: address,
    password: PASSWORD,
    ageConfirmed: true,
    preferredLanguage,
  });

/**
 * Lets the "one code a minute" limit pass without waiting. Goes through the raw
 * collection: Mongoose treats `createdAt` as unchangeable and would drop the update.
 */
async function skipCooldown(address: string) {
  const user = await User.findOne({ email: address.toLowerCase() });
  await EmailCode.collection.updateMany(
    { userId: user?._id },
    { $set: { createdAt: new Date(Date.now() - 2 * 60 * 1000) } },
  );
}

// These tests cover the confirm-email flow, so it is switched on here.
const verificationWas = env.emailVerificationRequired;

before(async () => {
  env.emailVerificationRequired = true;
  await connectDB({ dbName: 'kobaniq_test', retries: 2 });
  await Promise.all([User.syncIndexes(), RefreshToken.syncIndexes(), EmailCode.syncIndexes()]);
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  outbox.length = 0;
});

after(async () => {
  env.emailVerificationRequired = verificationWas;
  const ids = (await User.find({ email: DOMAIN_RE }, { _id: 1 }).lean()).map((u) => u._id);
  await EmailCode.deleteMany({ userId: { $in: ids } });
  await RefreshToken.deleteMany({ userId: { $in: ids } });
  await User.deleteMany({ email: DOMAIN_RE });
  server.close();
  await disconnectDB();
});

test('End Test: register → verify email → login → refresh → logout', async () => {
  const address = email('flow');
  const created = await register(address);
  assert.equal(created.status, 201);
  assert.equal(created.body.data?.user?.emailVerified, false);

  const verified = await call('/auth/verify-email', { email: address, code: lastCode(address) });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.data?.user?.emailVerified, true);

  const login = await call('/auth/login', { email: address, password: PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.body.data?.user?.emailVerified, true);

  const refreshed = await call('/auth/refresh', { refreshToken: login.body.data?.refreshToken });
  assert.equal(refreshed.status, 200);

  const out = await call('/auth/logout', { refreshToken: refreshed.body.data?.refreshToken });
  assert.equal(out.status, 204);
  const again = await call('/auth/refresh', { refreshToken: refreshed.body.data?.refreshToken });
  assert.equal(again.status, 401);
});

test('the verification email is in the account language and the code is stored only as a hash', async () => {
  const address = email('somali');
  await register(address, 'so');
  const [message] = emailsTo(address);
  assert.equal(message.subject, 'Koodhka xaqiijinta KOBANIQ');
  assert.match(message.text, /Koodhkaaga xaqiijinta KOBANIQ waa: \d{6}/);
  assert.match(message.text, /15 daqiiqo/);

  const code = lastCode(address);
  const stored = await EmailCode.findOne({ purpose: 'verifyEmail' }).sort({ createdAt: -1 }).lean();
  assert.ok(stored);
  assert.notEqual(stored.codeHash, code);
  assert.equal(JSON.stringify(stored).includes(code), false);
});

test('a wrong code is refused; after the limit even the right code stops working', async () => {
  const address = email('guess');
  await register(address);
  const code = lastCode(address);
  const wrong = code === '000000' ? '111111' : '000000';

  for (let i = 1; i < MAX_CODE_ATTEMPTS; i++) {
    const res = await call('/auth/verify-email', { email: address, code: wrong });
    assert.equal(res.status, 400);
    assert.equal(res.body.error?.code, 'INVALID_CODE');
  }
  const last = await call('/auth/verify-email', { email: address, code: wrong });
  assert.equal(last.status, 429);
  assert.equal(last.body.error?.code, 'TOO_MANY_ATTEMPTS');

  const right = await call('/auth/verify-email', { email: address, code });
  assert.equal(right.status, 429, 'locked code stays locked');
  const user = await User.findOne({ email: address.toLowerCase() });
  assert.equal(user?.emailVerified, false);
});

test('an expired code is refused', async () => {
  const address = email('expired');
  await register(address);
  const code = lastCode(address);
  const user = await User.findOne({ email: address.toLowerCase() });
  await EmailCode.updateMany({ userId: user?._id }, { expiresAt: new Date(Date.now() - 1000) });

  const res = await call('/auth/verify-email', { email: address, code });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'INVALID_CODE');
});

test('resend: one code a minute, a new code replaces the old one, unknown emails look the same', async () => {
  const address = email('resend');
  await register(address);
  const first = lastCode(address);

  const tooSoon = await call('/auth/verify-email/resend', { email: address });
  assert.equal(tooSoon.status, 204);
  assert.equal(emailsTo(address).length, 1, 'no second email within a minute');

  await skipCooldown(address);
  await call('/auth/verify-email/resend', { email: address });
  assert.equal(emailsTo(address).length, 2);
  const second = lastCode(address);

  if (second !== first) {
    const old = await call('/auth/verify-email', { email: address, code: first });
    assert.equal(old.body.error?.code, 'INVALID_CODE', 'the older code no longer works');
  }
  const ok = await call('/auth/verify-email', { email: address, code: second });
  assert.equal(ok.status, 200);

  const unknown = await call('/auth/verify-email/resend', { email: email('nobody') });
  assert.equal(unknown.status, 204);
  const unknownVerify = await call('/auth/verify-email', {
    email: email('nobody'),
    code: '123456',
  });
  assert.equal(unknownVerify.body.error?.code, 'INVALID_CODE', 'same answer as a wrong code');
});

test('verifying an already verified account just returns it', async () => {
  const address = email('twice');
  await register(address);
  const code = lastCode(address);
  await call('/auth/verify-email', { email: address, code });
  const again = await call('/auth/verify-email', { email: address, code });
  assert.equal(again.status, 200);
  assert.equal(again.body.data?.user?.emailVerified, true);
});

test('forgot + reset: new password works, old one does not, every session ends', async () => {
  const address = email('reset');
  await register(address);
  const login = await call('/auth/login', { email: address, password: PASSWORD });
  const oldRefresh = login.body.data?.refreshToken;

  const forgot = await call('/auth/forgot', { email: address });
  assert.equal(forgot.status, 204);
  const [resetEmail] = emailsTo(address).filter((m) => m.subject.includes('Reset'));
  assert.ok(resetEmail, 'a reset email was sent');
  const code = lastCode(address);

  const reset = await call('/auth/reset', { email: address, code, password: NEW_PASSWORD });
  assert.equal(reset.status, 204);

  const oldPassword = await call('/auth/login', { email: address, password: PASSWORD });
  assert.equal(oldPassword.status, 401);
  const newPassword = await call('/auth/login', { email: address, password: NEW_PASSWORD });
  assert.equal(newPassword.status, 200);
  assert.equal(newPassword.body.data?.user?.emailVerified, true, 'the code proved the email');

  const stolen = await call('/auth/refresh', { refreshToken: oldRefresh });
  assert.equal(stolen.status, 401, 'sessions from before the reset are ended');

  const reused = await call('/auth/reset', { email: address, code, password: 'another-one-11' });
  assert.equal(reused.body.error?.code, 'INVALID_CODE', 'a code works only once');
});

test('forgot: unknown or suspended accounts get the same 204 and no email', async () => {
  const unknown = email('ghost');
  const res = await call('/auth/forgot', { email: unknown });
  assert.equal(res.status, 204);

  const suspended = email('suspended');
  await register(suspended);
  outbox.length = 0;
  await User.updateOne({ email: suspended.toLowerCase() }, { status: 'suspended' });
  const res2 = await call('/auth/forgot', { email: suspended });
  assert.equal(res2.status, 204);
  assert.equal(outbox.length, 0);
});

test('a verification code cannot reset a password', async () => {
  const address = email('purpose');
  await register(address);
  const verifyCode = lastCode(address);
  const res = await call('/auth/reset', {
    email: address,
    code: verifyCode,
    password: NEW_PASSWORD,
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error?.code, 'INVALID_CODE');
});

test('inputs are checked and errors come back in the request language', async () => {
  const bad = await call('/auth/reset', { email: 'nope', code: '12ab', password: 'short' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error?.code, 'VALIDATION_ERROR');
  assert.deepEqual(Object.keys(bad.body.meta.details ?? {}).sort(), ['code', 'email', 'password']);

  const somali = await call(
    '/auth/verify-email',
    { email: email('x'), code: '123456' },
    { 'Accept-Language': 'so' },
  );
  assert.equal(somali.body.error?.message, 'Koodhku waa khalad ama wuu dhacay. Codso mid cusub');
});
