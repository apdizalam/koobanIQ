import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { outbox } from '../src/lib/mailer.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import { Waitlist } from '../src/models/Waitlist.js';
import { promoteToAdmin } from '../src/services/userService.js';
import {
  notifyWaitlistSignup,
  resetWaitlistNotifyForTests,
} from '../src/services/waitlistNotifyService.js';

// Admin waitlist page + "someone joined" email. Own database per run (dropped
// at the end); fictional people on .invalid domains; emails stay in `outbox`.
const DB_NAME = `kobaniq_test_admin_waitlist_${RUN_ID}`;
const PASSWORD = 'correct-horse-4';
const TEAM = 'team@admin-waitlist.invalid';
const savedAlertEmail = env.alertEmail;

let server: Server;
let baseUrl: string;
let admin: string;
let user: string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads any answer
type Json = any;

async function call(
  token: string | null,
  path: string,
  init: { method?: string; body?: unknown } = {},
) {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Json };
}

async function account(email: string, isAdmin = false) {
  await call(null, '/auth/register', {
    method: 'POST',
    body: { email, password: PASSWORD, ageConfirmed: true },
  });
  if (isAdmin) await promoteToAdmin(email);
  const { body } = await call(null, '/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
  });
  return body.data.accessToken as string;
}

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
const teamMail = () => outbox.filter((m) => m.to === TEAM);
/** Waits (up to 5 s) for the email that is sent after the answer. */
async function settle(count = 1) {
  for (let i = 0; i < 50 && teamMail().length < count; i += 1) {
    await new Promise((r) => setTimeout(r, 100));
  }
}
const emails = (body: Json) => body.data.items.map((i: Json) => i.email as string);

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User, RefreshToken, Waitlist].map((m) => m.syncIndexes()));
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = await account('boss@admin-waitlist.invalid', true);
  user = await account('amina@admin-waitlist.invalid');
});

beforeEach(async () => {
  env.alertEmail = TEAM;
  resetWaitlistNotifyForTests();
  outbox.length = 0;
  await Waitlist.deleteMany({});
});

after(async () => {
  env.alertEmail = savedAlertEmail;
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('only admins see the waitlist; the public route cannot list it', async () => {
  await Waitlist.create({ email: 'x@admin-waitlist.invalid', language: 'en', consentAt: at(1) });
  assert.equal((await call(null, '/admin/waitlist')).status, 401);
  assert.equal((await call(user, '/admin/waitlist')).status, 403);
  const pub = await call(null, '/waitlist');
  assert.equal(pub.status, 404, 'GET /waitlist does not exist');
  assert.equal(JSON.stringify(pub.body ?? {}).includes('x@admin-waitlist'), false);
  assert.equal((await call(admin, '/admin/waitlist')).status, 200);
});

test('newest first, with email, name, language, consent time and join date only', async () => {
  await Waitlist.collection.insertMany([
    {
      email: 'old@w.invalid',
      language: 'en',
      consentAt: at(60),
      source: 'landing',
      createdAt: at(60),
    },
    {
      email: 'new@w.invalid',
      name: 'Hodan',
      language: 'so',
      consentAt: at(5),
      source: 'landing',
      createdAt: at(5),
    },
  ]);
  const { status, body } = await call(admin, '/admin/waitlist');
  assert.equal(status, 200);
  assert.equal(body.data.total, 2);
  assert.equal(body.data.matching, 2);
  assert.deepEqual(emails(body), ['new@w.invalid', 'old@w.invalid']);
  const [first, second] = body.data.items;
  assert.deepEqual(Object.keys(first).sort(), [
    'consentAt',
    'createdAt',
    'email',
    'id',
    'language',
    'name',
    'source',
  ]);
  assert.equal(first.name, 'Hodan');
  assert.equal(first.language, 'so');
  assert.ok(first.consentAt);
  assert.equal(second.name, null);
});

test('search by email or name (any case, characters taken literally); paged', async () => {
  const people = Array.from({ length: 7 }, (_, i) => ({
    email: `p${i}@w.invalid`,
    language: 'en',
    consentAt: at(i),
    createdAt: at(i),
  }));
  await Waitlist.collection.insertMany([
    ...people,
    {
      email: 'zz@w.invalid',
      name: 'Mohamed Ali',
      language: 'so',
      consentAt: at(9),
      createdAt: at(9),
    },
  ]);
  const byName = await call(admin, '/admin/waitlist?q=MOHAMED');
  assert.deepEqual(emails(byName.body), ['zz@w.invalid']);
  assert.equal(byName.body.data.matching, 1);
  assert.equal(byName.body.data.total, 8);
  const byEmail = await call(admin, '/admin/waitlist?q=p3@');
  assert.deepEqual(emails(byEmail.body), ['p3@w.invalid']);
  const pattern = await call(admin, `/admin/waitlist?q=${encodeURIComponent('.*')}`);
  assert.equal(pattern.status, 200);
  assert.equal(pattern.body.data.matching, 0, '".*" is searched as text, not a pattern');

  const page1 = await call(admin, '/admin/waitlist?limit=3&page=1');
  const page3 = await call(admin, '/admin/waitlist?limit=3&page=3');
  assert.deepEqual(emails(page1.body), ['p0@w.invalid', 'p1@w.invalid', 'p2@w.invalid']);
  assert.deepEqual(emails(page3.body), ['p6@w.invalid', 'zz@w.invalid']);
  const odd = await call(admin, '/admin/waitlist?limit=abc&page=-4');
  assert.equal(odd.status, 200);
  assert.equal(odd.body.data.page, 1);
  assert.equal(odd.body.data.limit, 25);
});

test('a new sign-up emails the team once, without personal details; repeats and bots send nothing', async () => {
  const join = (body: Record<string, unknown>) =>
    call(null, '/waitlist', { method: 'POST', body: { language: 'en', consent: true, ...body } });
  assert.equal((await join({ email: 'first@w.invalid', name: 'Private Name' })).status, 201);
  await settle();
  assert.equal(teamMail().length, 1);
  assert.match(teamMail()[0].subject, /1 new person joined the waitlist \(1 in total\)/);
  const text = teamMail()[0].subject + teamMail()[0].text;
  assert.equal(text.includes('first@w.invalid'), false, 'no email address');
  assert.equal(text.includes('Private Name'), false, 'no name');

  assert.equal((await join({ email: 'first@w.invalid' })).status, 409);
  assert.equal((await join({ email: 'bot@w.invalid', website: 'spam' })).status, 201);
  await settle(2); // Waits the full 5 s: nothing more may arrive.
  assert.equal(teamMail().length, 1, 'no email for a repeat or a bot');
});

test('sign-ups close together are counted into the next email; no team address = no email', async () => {
  await Waitlist.create({ email: 'a@w.invalid', language: 'en', consentAt: new Date() });
  const sent: string[] = [];
  const send = async (m: { subject: string }) => {
    sent.push(m.subject);
  };
  const t0 = Date.now();
  assert.equal(await notifyWaitlistSignup({ send, now: () => t0 }), 'sent');
  assert.equal(await notifyWaitlistSignup({ send, now: () => t0 + 60_000 }), 'held');
  assert.equal(await notifyWaitlistSignup({ send, now: () => t0 + 120_000 }), 'held');
  assert.equal(
    await notifyWaitlistSignup({ send, now: () => t0 + env.alertCooldownMs + 1 }),
    'sent',
  );
  assert.equal(sent.length, 2);
  assert.match(sent[1], /3 new people joined/);

  env.alertEmail = '';
  assert.equal(await notifyWaitlistSignup({ send }), 'off');
});

test('a failed email never loses the sign-up; the count is kept for the next email', async () => {
  const broken = async () => {
    throw new Error('Resend down');
  };
  await Waitlist.create({ email: 'kept@w.invalid', language: 'en', consentAt: new Date() });
  const t0 = Date.now();
  assert.equal(await notifyWaitlistSignup({ send: broken, now: () => t0 }), 'failed');
  assert.ok(await Waitlist.exists({ email: 'kept@w.invalid' }));
  const sent: string[] = [];
  const send = async (m: { subject: string }) => {
    sent.push(m.subject);
  };
  assert.equal(
    await notifyWaitlistSignup({ send, now: () => t0 + env.alertCooldownMs + 1 }),
    'sent',
  );
  assert.match(sent[0], /2 new people joined/);
});
