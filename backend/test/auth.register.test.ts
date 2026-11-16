import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { User } from '../src/models/User.js';

// Every account made here uses this domain so cleanup never touches real users.
const DOMAIN = '@register-test.kobaniq.invalid';
const DOMAIN_RE = /@register-test\.kobaniq\.invalid$/;
const email = (name: string) => `${name}-${Date.now()}${DOMAIN}`;

let server: Server;
let baseUrl: string;

const register = (body: unknown) =>
  fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

before(async () => {
  await connectDB({ dbName: 'kobaniq_test', retries: 2 });
  await User.syncIndexes();
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await User.deleteMany({ email: DOMAIN_RE });
  server.close();
  await disconnectDB();
});

test('register creates a user and never returns the password hash', async () => {
  const address = email('Amina');
  const res = await register({
    email: address,
    password: 'correct-horse-1',
    preferredLanguage: 'so',
  });
  const body = await res.json();

  assert.equal(res.status, 201);
  assert.equal(body.error, null);
  assert.equal(body.data.user.email, address.toLowerCase());
  assert.equal(body.data.user.role, 'user');
  assert.equal(body.data.user.status, 'active');
  assert.equal(body.data.user.emailVerified, false);
  assert.equal(body.data.user.preferredLanguage, 'so');
  assert.equal('passwordHash' in body.data.user, false);
  assert.equal(JSON.stringify(body).includes('correct-horse-1'), false);
});

test('password is stored only as a bcrypt hash', async () => {
  const address = email('hash');
  await register({ email: address, password: 'correct-horse-2' });
  const stored = await User.findOne({ email: address }).select('+passwordHash').lean();

  assert.ok(stored?.passwordHash);
  assert.notEqual(stored.passwordHash, 'correct-horse-2');
  assert.equal(await bcrypt.compare('correct-horse-2', stored.passwordHash), true);
});

test('registering the same email twice returns 409 EMAIL_TAKEN', async () => {
  const address = email('dup');
  assert.equal((await register({ email: address, password: 'correct-horse-3' })).status, 201);
  const res = await register({ email: address.toUpperCase(), password: 'correct-horse-3' });
  const body = await res.json();
  assert.equal(res.status, 409);
  assert.equal(body.error.code, 'EMAIL_TAKEN');
});

test('invalid input returns 400 with a message per field', async () => {
  const res = await register({ email: 'not-an-email', password: 'short', preferredLanguage: 'fr' });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(Object.keys(body.meta.details).sort(), [
    'email',
    'password',
    'preferredLanguage',
  ]);
});

test('a malformed JSON body returns 400 INVALID_JSON', async () => {
  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"email":',
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'INVALID_JSON');
});
