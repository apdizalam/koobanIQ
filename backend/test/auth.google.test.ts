import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { GOOGLE_TOKEN_URL } from '../src/lib/googleOAuth.js';
import { GoogleSignIn } from '../src/models/GoogleSignIn.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import { RUN_ID, testDomain } from './support/testRun.js';

/**
 * TIQ-39: Continue with Google. Google itself is replaced by a fake token
 * endpoint, so these tests need no Google account and no network.
 */
const { DOMAIN, DOMAIN_RE } = testDomain('google');
const RETURN_URL = `exp://kobaniq-test-${RUN_ID}:8082/--/auth/google`;
const CLIENT_ID = 'test-client.apps.googleusercontent.com';

let server: Server;
let baseUrl: string;
const realFetch = globalThis.fetch;
const saved = {
  id: env.googleClientId,
  secret: env.googleClientSecret,
  redirect: env.googleRedirectUri,
};

/** Google codes the fake token endpoint knows, each with the ID-token claims it returns. */
const googleCodes = new Map<string, Record<string, unknown>>();
const googleCalls: URLSearchParams[] = [];

function idToken(claims: Record<string, unknown>) {
  return jwt.sign(
    {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      ...claims,
    },
    'not-checked-by-the-server',
  );
}

const api = (path: string) => `${baseUrl}/api/v1${path}`;
const post = (path: string, body: unknown) =>
  realFetch(api(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Opens /google/start like the app's browser would; returns Google's page address. */
async function start(returnUrl = RETURN_URL) {
  const res = await realFetch(
    api(`/auth/google/start?returnUrl=${encodeURIComponent(returnUrl)}`),
    {
      redirect: 'manual',
    },
  );
  return { res, location: new URL(res.headers.get('location') ?? 'about:blank') };
}

/** Google sends the browser back to /callback; returns where the server sends it next. */
async function callback(params: Record<string, string>) {
  const res = await realFetch(api(`/auth/google/callback?${new URLSearchParams(params)}`), {
    redirect: 'manual',
  });
  return { res, location: res.headers.get('location') };
}

/** The whole browser part: start, "Google" answers with these claims, back to the app. */
async function signInAtGoogle(claims: Record<string, unknown>) {
  const { location } = await start();
  const state = location.searchParams.get('state') ?? '';
  const code = `google-code-${Math.random()}`;
  googleCodes.set(code, claims);
  const back = await callback({ state, code });
  assert.equal(back.res.status, 302);
  return new URL(back.location ?? '');
}

async function signInWithGoogle(claims: Record<string, unknown>, extra: object = {}) {
  const appLink = await signInAtGoogle(claims);
  const code = appLink.searchParams.get('code');
  assert.ok(code, `expected a code in ${appLink.toString()}`);
  return { code, res: await post('/auth/google/complete', { code, ...extra }) };
}

const email = (name: string) => `${name}-${Date.now()}${DOMAIN}`;

before(async () => {
  env.googleClientId = CLIENT_ID;
  env.googleClientSecret = 'test-secret';
  env.googleRedirectUri = 'https://api.kobaniq.test/api/v1/auth/google/callback';
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url !== GOOGLE_TOKEN_URL) return realFetch(input, init);
    const form = new URLSearchParams(String(init?.body));
    googleCalls.push(form);
    const claims = googleCodes.get(form.get('code') ?? '');
    if (!claims) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    return new Response(JSON.stringify({ id_token: idToken(claims) }), { status: 200 });
  }) as typeof fetch;

  await connectDB({ dbName: 'kobaniq_test', retries: 2 });
  await Promise.all([User.syncIndexes(), RefreshToken.syncIndexes(), GoogleSignIn.syncIndexes()]);
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  env.googleClientId = saved.id;
  env.googleClientSecret = saved.secret;
  env.googleRedirectUri = saved.redirect;
  const users = await User.find({ email: DOMAIN_RE }, { _id: 1 }).lean();
  await RefreshToken.deleteMany({ userId: { $in: users.map((u) => u._id) } });
  await User.deleteMany({ email: DOMAIN_RE });
  await GoogleSignIn.deleteMany({ returnUrl: { $regex: `kobaniq-test-${RUN_ID}` } });
  server.close();
  await disconnectDB();
});

test('start sends the browser to Google with PKCE, a state and our client', async () => {
  const { res, location } = await start();
  assert.equal(res.status, 302);
  assert.equal(location.origin + location.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(location.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(location.searchParams.get('redirect_uri'), env.googleRedirectUri);
  assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(location.searchParams.get('code_challenge'));
  assert.ok((location.searchParams.get('state') ?? '').length >= 40);
  assert.equal(location.searchParams.get('scope'), 'openid email profile');
});

test('a new Google user confirms their age once and gets an account without a password', async () => {
  const address = email('new');
  const sub = `sub-new-${Date.now()}`;
  const first = await signInWithGoogle({ sub, email: address, email_verified: true });
  assert.equal(first.res.status, 400);
  assert.equal((await first.res.json()).error.code, 'AGE_CONFIRM_REQUIRED');
  assert.equal(await User.exists({ email: address }), null);

  // Same one-time code, now with the age confirmed.
  const res = await post('/auth/google/complete', {
    code: first.code,
    ageConfirmed: true,
    preferredLanguage: 'so',
  });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.user.email, address);
  assert.equal(data.user.emailVerified, true);
  assert.equal(data.user.preferredLanguage, 'so');
  assert.ok(data.accessToken && data.refreshToken);

  const user = await User.findOne({ email: address }).select('+passwordHash');
  assert.equal(user?.authProvider, 'google');
  assert.equal(user?.googleId, sub);
  assert.equal(user?.passwordHash, undefined);
  assert.ok(user?.ageConfirmedAt);

  // The server sent Google the PKCE secret and its client secret, never the app.
  const call = googleCalls.at(-1)!;
  assert.ok(call.get('code_verifier'));
  assert.equal(call.get('client_secret'), 'test-secret');

  // The one-time code works once.
  const again = await post('/auth/google/complete', { code: first.code, ageConfirmed: true });
  assert.equal(again.status, 400);
  assert.equal((await again.json()).error.code, 'GOOGLE_SIGN_IN_FAILED');

  // No password: email + password login is refused; sign-out works.
  const login = await post('/auth/login', { email: address, password: 'anything-123' });
  assert.equal(login.status, 401);
  const logout = await post('/auth/logout', { refreshToken: data.refreshToken });
  assert.equal(logout.status, 204);
  const refresh = await post('/auth/refresh', { refreshToken: data.refreshToken });
  assert.equal(refresh.status, 401);
});

test('a returning Google user signs in to the same account without questions', async () => {
  const address = email('returning');
  const sub = `sub-returning-${Date.now()}`;
  const first = await signInWithGoogle(
    { sub, email: address, email_verified: true },
    { ageConfirmed: true },
  );
  const firstId = (await first.res.json()).data.user.id;
  const second = await signInWithGoogle({ sub, email: address, email_verified: true });
  assert.equal(second.res.status, 200);
  assert.equal((await second.res.json()).data.user.id, firstId);
  assert.equal(await User.countDocuments({ email: address }), 1);
});

test('the same email as an existing account signs in to that account', async () => {
  const address = email('linked');
  const reg = await post('/auth/register', {
    email: address,
    password: 'correct-horse-9',
    ageConfirmed: true,
  });
  assert.equal(reg.status, 201);
  const existingId = (await reg.json()).data.user.id;

  const { res } = await signInWithGoogle({
    sub: `sub-linked-${Date.now()}`,
    email: address.toUpperCase(),
    email_verified: true,
  });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.user.id, existingId);
  assert.equal(data.user.emailVerified, true);
  assert.equal(await User.countDocuments({ email: address }), 1);

  // The password still works for this account.
  const login = await post('/auth/login', { email: address, password: 'correct-horse-9' });
  assert.equal(login.status, 200);
});

test('a Google address that Google has not confirmed is refused', async () => {
  const link = await signInAtGoogle({
    sub: `sub-unverified-${Date.now()}`,
    email: email('unverified'),
    email_verified: false,
  });
  assert.equal(link.searchParams.get('error'), 'failed');
  assert.equal(link.searchParams.get('code'), null);
});

test('an ID token made for another app is refused', async () => {
  const link = await signInAtGoogle({
    sub: `sub-other-${Date.now()}`,
    email: email('other'),
    email_verified: true,
    aud: 'someone-else.apps.googleusercontent.com',
  });
  assert.equal(link.searchParams.get('error'), 'failed');
});

test('a suspended account cannot sign in with Google', async () => {
  const address = email('suspended');
  const sub = `sub-suspended-${Date.now()}`;
  await signInWithGoogle({ sub, email: address, email_verified: true }, { ageConfirmed: true });
  await User.updateOne({ email: address }, { status: 'suspended' });
  const { res } = await signInWithGoogle({ sub, email: address, email_verified: true });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'ACCOUNT_SUSPENDED');
});

test('pressing Cancel at Google returns to the app with error=cancelled', async () => {
  const { location } = await start();
  const back = await callback({
    state: location.searchParams.get('state') ?? '',
    error: 'access_denied',
  });
  assert.equal(back.res.status, 302);
  assert.equal(new URL(back.location ?? '').searchParams.get('error'), 'cancelled');
});

test('an unknown or reused state shows a short page instead of redirecting', async () => {
  const back = await callback({ state: 'made-up-state', code: 'x' });
  assert.equal(back.res.status, 400);
  assert.equal(back.location, null);
  assert.match(await back.res.text(), /KOBANIQ app/);
});

test('only links into the app are accepted as the return address', async () => {
  for (const bad of ['https://evil.example/steal', 'javascript:alert(1)', 'not a url']) {
    const { res } = await start(bad);
    assert.equal(res.status, 400, bad);
    assert.equal((await res.json()).error.code, 'VALIDATION_ERROR');
  }
  const ok = await start('kobaniq://auth/google');
  assert.equal(ok.res.status, 302);
});

test('without Google settings the app is told "not set up"', async () => {
  env.googleClientSecret = '';
  try {
    const { res, location } = await start();
    assert.equal(res.status, 302);
    assert.equal(location.protocol, 'exp:');
    assert.equal(location.searchParams.get('error'), 'not_configured');
  } finally {
    env.googleClientSecret = 'test-secret';
  }
});

test('a made-up code or a bad body is refused', async () => {
  const res = await post('/auth/google/complete', { code: 'x'.repeat(43) });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'GOOGLE_SIGN_IN_FAILED');
  const bad = await post('/auth/google/complete', { code: 1, ageConfirmed: 'yes' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'VALIDATION_ERROR');
});
