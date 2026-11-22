import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Waitlist } from '../src/models/Waitlist.js';
import { waitlistLimit } from '../src/routes/waitlist.js';

// TIQ-34 landing page waitlist. Own database per run (dropped at the end);
// fictional addresses on .invalid domains.
const DB_NAME = `kobaniq_test_waitlist_${RUN_ID}`;

let server: Server;
let baseUrl: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads any answer
type Json = any;

async function join(body: unknown, language = 'en') {
  const res = await fetch(`${baseUrl}/api/v1/waitlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': language },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Json };
}

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Waitlist.syncIndexes();
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('End Test: a waitlist sign-up is stored once; the same email again is refused politely', async () => {
  const first = await join({
    email: ' Amina@Waitlist.invalid ',
    name: 'Amina',
    language: 'so',
    consent: true,
  });
  assert.equal(first.status, 201);
  assert.deepEqual(first.body.data, { joined: true });
  const saved = await Waitlist.findOne({ email: 'amina@waitlist.invalid' }).lean();
  assert.equal(saved?.name, 'Amina');
  assert.equal(saved?.language, 'so');
  assert.ok(saved?.consentAt);

  const again = await join(
    { email: 'amina@waitlist.invalid', language: 'so', consent: true },
    'so',
  );
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'WAITLIST_EXISTS');
  assert.match(again.body.error.message, /liiska sugitaanka/, 'answered in Somali');
  assert.equal(await Waitlist.countDocuments(), 1, 'stored once');
});

test('email, language and agreement to the privacy policy are required', async () => {
  const bad = await join({
    email: 'not-an-email',
    language: 'fr',
    consent: false,
    name: 'x'.repeat(81),
  });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.meta.details).sort(), [
    'consent',
    'email',
    'language',
    'name',
  ]);
  assert.equal(await Waitlist.countDocuments(), 1);
});

test('a bot filling the hidden field gets a normal answer but nothing is saved', async () => {
  const res = await join({
    email: 'bot@waitlist.invalid',
    language: 'en',
    consent: true,
    website: 'https://spam.invalid',
  });
  assert.equal(res.status, 201);
  assert.equal(await Waitlist.countDocuments({ email: 'bot@waitlist.invalid' }), 0);
});

test('too many sign-ups from one address in an hour are slowed down', async () => {
  // Three requests were made above; the limit counts them too.
  let last = 0;
  for (let i = 0; i < waitlistLimit.max; i += 1) {
    last = (await join({ email: `p${i}@waitlist.invalid`, language: 'en', consent: true })).status;
  }
  assert.equal(last, 429);
  const res = await join({ email: 'late@waitlist.invalid', language: 'en', consent: true });
  assert.equal(res.status, 429);
  assert.equal(res.body.error.code, 'TOO_MANY_REQUESTS');
});
