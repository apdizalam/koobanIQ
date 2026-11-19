import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { testDomain } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { languageFromHeader, translate } from '../src/lib/i18n.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';

// Every account made here uses this run's own domain, so cleanup never touches real
// users or another test run's users.
const { DOMAIN, DOMAIN_RE } = testDomain('i18n');
const PASSWORD = 'correct-horse-4';

let server: Server;
let baseUrl: string;

const call = (
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) =>
  fetch(`${baseUrl}/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

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

test('Accept-Language picks the best supported language', () => {
  assert.equal(languageFromHeader('so-SO,so;q=0.9,en;q=0.8'), 'so');
  assert.equal(languageFromHeader('en-US,so;q=0.5'), 'en');
  assert.equal(languageFromHeader('fr-FR,so;q=0.4,en;q=0.9'), 'en');
  assert.equal(languageFromHeader('so;q=0'), undefined);
  assert.equal(languageFromHeader('fr'), undefined);
  assert.equal(languageFromHeader(undefined), undefined);
});

test('translate fills placeholders and falls back to English', () => {
  assert.equal(
    translate('so', 'server.validation.passwordTooShort', { min: 8 }),
    'Erayga sirta ahi waa inuu ahaadaa ugu yaraan 8 xaraf',
  );
  assert.equal(translate('so', 'server.errors.NO_SUCH_CODE'), undefined);
});

test('errors are in Somali when the request asks for Somali', async () => {
  const res = await call('/auth/login', {
    method: 'POST',
    body: {},
    headers: { 'Accept-Language': 'so' },
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR', 'the code never changes with the language');
  assert.equal(body.error.message, 'Qaar ka mid ah meelaha waa khalad');
  assert.deepEqual(body.meta.details, {
    email: 'Iimaylka waa loo baahan yahay',
    password: 'Erayga sirta ah waa loo baahan yahay',
  });
});

test('errors stay in English by default, with field placeholders filled in', async () => {
  const res = await call('/auth/register', {
    method: 'POST',
    body: { email: `short${DOMAIN}`, password: 'short' },
  });
  const body = await res.json();
  assert.equal(body.error.message, 'Some fields are invalid');
  assert.equal(body.meta.details.password, 'Password must be at least 8 characters');

  const missing = await (await call('/nope', { headers: { 'Accept-Language': 'so' } })).json();
  assert.deepEqual(missing.error, { code: 'NOT_FOUND', message: 'Wadadan lama helin' });
});

test('a signed-in user gets errors in their saved language, even without the header', async () => {
  const email = `somali${Date.now()}${DOMAIN}`;
  await call('/auth/register', {
    method: 'POST',
    body: { email, password: PASSWORD, ageConfirmed: true, preferredLanguage: 'so' },
  });
  const login = await (
    await call('/auth/login', { method: 'POST', body: { email, password: PASSWORD } })
  ).json();
  const res = await call('/admin/access', {
    headers: { Authorization: `Bearer ${login.data.accessToken}`, 'Accept-Language': 'en' },
  });
  const body = await res.json();
  assert.equal(res.status, 403);
  assert.deepEqual(body.error, { code: 'FORBIDDEN', message: 'Ogolaansho uma lihid boggan' });
});

test('every error code and field message used in the code has en and so text', () => {
  const srcDir = join(__dirname, '..', 'src');
  const files = readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.ts'))
    .map((f) => readFileSync(join(f.parentPath, f.name), 'utf8'))
    .join('\n');
  const codes = new Set(
    [
      ...files.matchAll(
        /(?:AppError\(\s*\d+,\s*|sendError\([^,]+,[^,]+,\s*\d+,\s*|code: )'([A-Z_]{4,})'/g,
      ),
    ].map((m) => m[1]),
  );
  const fieldKeys = new Set(
    [
      ...files.matchAll(
        /(?:details(?:\.\w+|\[key\])\s*=\s*|(?:refreshToken|period):\s*)'([a-z][A-Za-z]+)'/g,
      ),
    ].map((m) => m[1]),
  );
  assert.ok(codes.size >= 14, `found ${codes.size} error codes`);
  assert.ok(fieldKeys.size >= 10, `found ${fieldKeys.size} field keys`);
  for (const code of codes) {
    for (const lang of ['en', 'so'] as const) {
      assert.ok(translate(lang, `server.errors.${code}`), `missing ${lang} text for ${code}`);
    }
  }
  for (const key of fieldKeys) {
    for (const lang of ['en', 'so'] as const) {
      assert.ok(translate(lang, `server.validation.${key}`), `missing ${lang} text for ${key}`);
    }
  }
});
