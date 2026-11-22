import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Assessment } from '../src/models/Assessment.js';
import { Cv } from '../src/models/Cv.js';
import { ResearchRun } from '../src/models/ResearchRun.js';
import { User } from '../src/models/User.js';
import { Waitlist } from '../src/models/Waitlist.js';
import { getOverview } from '../src/services/overviewService.js';
import { promoteToAdmin } from '../src/services/userService.js';

// Own database per run: other test files and other CI jobs add and remove users,
// which would make exact counts flaky. It is dropped at the end.
const DB_NAME = `kobaniq_test_overview_${RUN_ID}`;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date();
const ago = (ms: number) => new Date(now.getTime() - ms);

let server: Server;
let baseUrl: string;

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await User.syncIndexes();
  // Raw inserts so createdAt / lastActiveAt are exactly what the test says.
  await User.collection.insertMany([
    {
      email: 'a@overview.invalid',
      role: 'user',
      status: 'active',
      preferredLanguage: 'en',
      createdAt: ago(2 * DAY),
      lastActiveAt: ago(HOUR),
    },
    {
      email: 'b@overview.invalid',
      role: 'user',
      status: 'active',
      preferredLanguage: 'so',
      createdAt: ago(10 * DAY),
      lastActiveAt: ago(3 * DAY),
    },
    {
      email: 'c@overview.invalid',
      role: 'user',
      status: 'suspended',
      preferredLanguage: 'so',
      createdAt: ago(40 * DAY),
    },
    {
      email: 'd@overview.invalid',
      role: 'admin',
      status: 'active',
      preferredLanguage: 'en',
      createdAt: ago(400 * DAY),
      lastActiveAt: ago(20 * DAY),
    },
  ]);
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('counts users per period from the database', async () => {
  const day = await getOverview('day', now);
  assert.deepEqual(day.users, { total: 4, admins: 1, suspended: 1, new: 0, active: 1 });
  assert.deepEqual(day.languages, { en: 2, so: 2 });

  assert.deepEqual((await getOverview('week', now)).users, {
    total: 4,
    admins: 1,
    suspended: 1,
    new: 1,
    active: 2,
  });
  assert.deepEqual((await getOverview('month', now)).users, {
    total: 4,
    admins: 1,
    suspended: 1,
    new: 2,
    active: 3,
  });
  assert.deepEqual((await getOverview('year', now)).users, {
    total: 4,
    admins: 1,
    suspended: 1,
    new: 3,
    active: 3,
  });
});

async function signIn(email: string, admin: boolean) {
  const password = 'correct-horse-1';
  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}/api/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await post('/auth/register', { email, password, ageConfirmed: true })).status, 201);
  if (admin) await promoteToAdmin(email);
  return (await (await post('/auth/login', { email, password })).json()).data.accessToken as string;
}

const overview = (token: string, query = '') =>
  fetch(`${baseUrl}/api/v1/admin/overview${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

test('GET /admin/overview matches direct database counts (End Test)', async () => {
  const token = await signIn('boss@overview.invalid', true);
  const res = await overview(token, '?period=month');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.period, 'month');

  const since = new Date(body.data.since);
  assert.deepEqual(body.data.users, {
    total: await User.countDocuments(),
    admins: await User.countDocuments({ role: 'admin' }),
    suspended: await User.countDocuments({ status: 'suspended' }),
    new: await User.countDocuments({ createdAt: { $gte: since } }),
    active: await User.countDocuments({ lastActiveAt: { $gte: since } }),
  });
  assert.deepEqual(body.data.languages, {
    en: await User.countDocuments({ preferredLanguage: 'en' }),
    so: await User.countDocuments({ preferredLanguage: 'so' }),
  });
});

test('the period defaults to week and must be day, week, month or year', async () => {
  const token = await signIn('boss2@overview.invalid', true);
  assert.equal((await (await overview(token)).json()).data.period, 'week');
  const bad = await overview(token, '?period=decade');
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'VALIDATION_ERROR');
});

test('a non-admin cannot read the overview (403)', async () => {
  const token = await signIn('seeker@overview.invalid', false);
  assert.equal((await overview(token)).status, 403);
});

test('TIQ-35: activity in the period (quizzes, CVs, searches, failed searches) and the waitlist', async () => {
  const userId = new mongoose.Types.ObjectId();
  await Assessment.collection.insertMany([
    { userId, status: 'finished', finishedAt: ago(HOUR), createdAt: ago(2 * HOUR) },
    { userId, status: 'finished', finishedAt: ago(10 * DAY), createdAt: ago(10 * DAY) },
    { userId, status: 'in_progress', createdAt: ago(HOUR) },
  ]);
  await Cv.collection.insertMany([
    { userId, version: 1, createdAt: ago(3 * HOUR) },
    { userId, version: 2, createdAt: ago(40 * DAY) },
  ]);
  await ResearchRun.collection.insertMany([
    { userId, status: 'completed', createdAt: ago(HOUR) },
    { userId, status: 'failed', createdAt: ago(2 * HOUR) },
    { userId, status: 'failed', createdAt: ago(9 * DAY) },
  ]);
  await Waitlist.collection.insertMany([
    { email: 'a@wait.invalid', language: 'en', consentAt: now, createdAt: now },
    { email: 'b@wait.invalid', language: 'so', consentAt: now, createdAt: now },
  ]);

  const day = await getOverview('day', new Date());
  assert.deepEqual(day.activity, { quizzesFinished: 1, cvsCreated: 1, runs: 2, runsFailed: 1 });
  assert.equal(day.waitlist, 2);
  const month = await getOverview('month', new Date());
  assert.deepEqual(month.activity, { quizzesFinished: 2, cvsCreated: 1, runs: 3, runsFailed: 2 });
});
