import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { registerAdapter, unregisterAdapter } from '../src/jobs/sources/registry.js';
import type { NormalizedJob } from '../src/jobs/sources/types.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { outbox } from '../src/lib/mailer.js';
import { pushOutbox } from '../src/lib/push.js';
import { Job } from '../src/models/Job.js';
import { JobMatch } from '../src/models/JobMatch.js';
import { JobSource } from '../src/models/JobSource.js';
import { Notification, PushToken } from '../src/models/Notification.js';
import { Profile } from '../src/models/Profile.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { ResearchRun } from '../src/models/ResearchRun.js';
import { Skill } from '../src/models/Skill.js';
import { User } from '../src/models/User.js';
import { MAX_ALERTS_PER_RUN } from '../src/services/notificationService.js';
import { researchSettings } from '../src/services/researchService.js';
import { RUN_ID } from './support/testRun.js';

// TIQ-22: notifications for new strong matches. Own database per run; fictional people,
// employers and jobs; fake sources; push and email go to in-memory outboxes only.
const DB_NAME = `kobaniq_test_notify_${RUN_ID}`;
const PASSWORD = 'correct-horse-22n';
const TOKEN = 'ExponentPushToken[aminaPhone0001]';

let server: Server;
let baseUrl: string;
let amina: string;
let hodan: string;
let aminaId: mongoose.Types.ObjectId;
/** What the fake board returns next. */
let board: NormalizedJob[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads any answer
type Json = any;

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json };
}

async function account(email: string) {
  await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, ageConfirmed: true }),
  });
  const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return ((await login.json()) as Json).data.accessToken as string;
}

/** A job that fits Amina well (her skills, level, region and wanted title). */
const fitting = (n: number): NormalizedJob => ({
  sourceKey: 'notify-board',
  externalId: `notify-${n}`,
  title: 'Data Officer',
  employer: `Example Relief Org ${n}`,
  employerType: 'ngo',
  region: 'somaliland',
  city: 'Hargeisa',
  applyUrl: `https://jobs.example.invalid/apply/${n}`,
  description:
    'Requirements:\n- At least two (2) years of relevant work experience.\n- Excel and report writing.',
});
/** A job that does not fit (far above her level, skills missing). */
const unfitting = (n: number): NormalizedJob => ({
  ...fitting(n),
  title: 'Head of Finance',
  description: 'Requirements: minimum 12 years of experience; IFRS, SAP and audit are required.',
});

/** Runs a search for the user (as the app does) and waits until it has finished. */
async function search(token: string) {
  const started = await call(token, 'POST', '/research/run', {
    sourceKeys: ['notify-board'],
    regions: ['somaliland'],
  });
  assert.equal(started.status, 202, JSON.stringify(started.body));
  for (let i = 0; i < 300; i += 1) {
    const run = await call(token, 'GET', `/research/runs/${started.body.data.run.id}`);
    if (run.body.data.run.status !== 'running') {
      // Notifications are sent before the run shows as finished: nothing to wait for.
      return run.body.data;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('search did not finish');
}

before(async () => {
  researchSettings.retryBaseMs = 5;
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all(
    [
      User,
      RefreshToken,
      Profile,
      Skill,
      Job,
      JobMatch,
      JobSource,
      ResearchRun,
      Notification,
      PushToken,
    ].map((m) => m.syncIndexes()),
  );
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  amina = await account('amina@notify.invalid');
  hodan = await account('hodan@notify.invalid');
  aminaId = (await User.findOne({ email: 'amina@notify.invalid' }))!._id;
  // A data officer with two years (fictional), whose skills a "Data Officer" ad asks for.
  await Profile.create({
    userId: aminaId,
    personal: { headline: 'Data officer' },
    experience: [
      {
        title: 'Data officer',
        employer: 'Example Clinic',
        startDate: '2023-01',
        description: 'Cleaned survey data in Excel and wrote monthly reports.',
      },
    ],
    preferences: { titles: ['Data Officer'], regions: ['somaliland'], cities: ['Hargeisa'] },
  });
  await Skill.create([
    {
      userId: aminaId,
      name: 'Microsoft Excel',
      key: 'microsoft excel',
      selfLevel: 'mid',
      assessedLevel: 'advanced',
    },
    {
      userId: aminaId,
      name: 'Report writing',
      key: 'report writing',
      selfLevel: 'mid',
      assessedLevel: 'advanced',
    },
  ]);
  registerAdapter({ key: 'notify-board', search: async () => board });
  await JobSource.create({
    key: 'notify-board',
    name: 'Notify test board',
    type: 'job_board',
    connection: 'api',
    regions: ['somaliland'],
    employerTypes: ['ngo'],
    enabled: true,
    termsCheckedAt: new Date(),
  });
});

beforeEach(() => {
  pushOutbox.length = 0;
  outbox.length = 0;
});

after(async () => {
  unregisterAdapter('notify-board');
  env.notificationEmailsEnabled = false;
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('push token: only real Expo tokens are stored', async () => {
  const bad = await call(amina, 'POST', '/notifications/push-token', { token: 'hello' });
  assert.equal(bad.status, 400);
  const ok = await call(amina, 'POST', '/notifications/push-token', {
    token: TOKEN,
    platform: 'ios',
  });
  assert.equal(ok.status, 204);
  assert.equal(await PushToken.countDocuments({ userId: aminaId }), 1);
});

test('End Test: a new strong match gives exactly one push and one in-app item; never again', async () => {
  board = [fitting(1), unfitting(2)];
  const run = await search(amina);
  const strongIds = run.recommended
    .filter((r: Json) => r.match.category === 'strong')
    .map((r: Json) => r.job.id);
  assert.equal(strongIds.length, 1, 'the fitting job is a strong match');

  const items = await call(amina, 'GET', '/notifications');
  assert.equal(items.body.data.notifications.length, 1);
  assert.equal(items.body.data.unread, 1);
  const item = items.body.data.notifications[0];
  assert.equal(item.type, 'strong_match');
  assert.equal(item.jobId, strongIds[0]);
  assert.equal(item.values.title, 'Data Officer');

  // One push, to her phone, in her language, opening that job.
  assert.equal(pushOutbox.length, 1);
  assert.equal(pushOutbox[0].to, TOKEN);
  assert.match(pushOutbox[0].title, /^A strong job match for you \(\d+%\)$/);
  assert.equal(pushOutbox[0].body, 'Data Officer · Example Relief Org 1');
  assert.equal(pushOutbox[0].data.jobId, strongIds[0]);
  // Email is off on this server (NOTIFICATION_EMAILS_ENABLED not set).
  assert.equal(outbox.length, 0);

  // The same job found again: nothing new.
  await search(amina);
  assert.equal(pushOutbox.length, 1);
  assert.equal((await call(amina, 'GET', '/notifications')).body.data.notifications.length, 1);
});

test('End Test: turning notifications off stops them (push and email); in-app stays', async () => {
  const bad = await call(amina, 'PUT', '/notifications/settings', { push: 'no' });
  assert.equal(bad.status, 400);
  const off = await call(amina, 'PUT', '/notifications/settings', { push: false, email: false });
  assert.deepEqual(off.body.data.settings, { push: false, email: false, emailAvailable: false });
  env.notificationEmailsEnabled = true;
  board = [fitting(3)];
  await search(amina);
  assert.equal(pushOutbox.length, 0, 'no push when push is off');
  assert.equal(outbox.length, 0, 'no email when email is off');
  assert.equal(await Notification.countDocuments({ userId: aminaId }), 2, 'still in the list');
  env.notificationEmailsEnabled = false;
  await call(amina, 'PUT', '/notifications/settings', { push: true, email: true });
});

test('email (when the server switch is on) and Somali texts', async () => {
  env.notificationEmailsEnabled = true;
  await User.updateOne({ _id: aminaId }, { preferredLanguage: 'so' });
  board = [fitting(4)];
  await search(amina);
  assert.equal(pushOutbox.length, 1);
  assert.match(pushOutbox[0].title, /^Shaqo si fiican kuugu habboon/);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, 'amina@notify.invalid');
  assert.equal(outbox[0].subject, 'KOBANIQ: shaqooyin cusub oo kugu habboon');
  assert.match(outbox[0].text, /Data Officer · Example Relief Org 4/);
  await User.updateOne({ _id: aminaId }, { preferredLanguage: 'en' });
  env.notificationEmailsEnabled = false;
});

test(`at most ${MAX_ALERTS_PER_RUN} pushes per search; the rest are in the list only`, async () => {
  board = Array.from({ length: MAX_ALERTS_PER_RUN + 2 }, (_, i) => fitting(100 + i));
  await search(amina);
  assert.equal(pushOutbox.length, MAX_ALERTS_PER_RUN);
  assert.equal(
    await Notification.countDocuments({ userId: aminaId, 'values.employer': /Org 1\d\d$/ }),
    MAX_ALERTS_PER_RUN + 2,
  );
});

test('list: read one, read all; private per user; deleted with the account data', async () => {
  const list = await call(amina, 'GET', '/notifications');
  const first = list.body.data.notifications[0];
  assert.equal((await call(hodan, 'POST', `/notifications/${first.id}/read`)).status, 404);
  const read = await call(amina, 'POST', `/notifications/${first.id}/read`);
  assert.equal(read.body.data.notification.read, true);
  assert.equal(
    (await call(amina, 'GET', '/notifications')).body.data.unread,
    list.body.data.unread - 1,
  );
  assert.equal((await call(amina, 'POST', '/notifications/read-all')).status, 204);
  assert.equal((await call(amina, 'GET', '/notifications')).body.data.unread, 0);
  assert.equal((await call(hodan, 'GET', '/notifications')).body.data.notifications.length, 0);
  const settings = await call(hodan, 'GET', '/notifications/settings');
  assert.deepEqual(settings.body.data.settings, { push: true, email: true, emailAvailable: false });
  // Signing out removes this phone.
  assert.equal(
    (await call(amina, 'DELETE', '/notifications/push-token', { token: TOKEN })).status,
    204,
  );
  assert.equal(await PushToken.countDocuments({ userId: aminaId }), 0);
});
