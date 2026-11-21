import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { AI_FEATURES, UsageRecord } from '../src/models/UsageRecord.js';
import { User } from '../src/models/User.js';
import { promoteToAdmin } from '../src/services/userService.js';

// TIQ-23. Own database per run so the totals only hold this file's records.
const DB_NAME = `kobaniq_test_usage_${RUN_ID}`;
const PASSWORD = 'correct-horse-2';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);

let server: Server;
let baseUrl: string;
let adminToken: string;
let userToken: string;
let amina: string;
let omar: string;

const call = (path: string, token?: string) =>
  fetch(`${baseUrl}/api/v1${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

async function account(email: string, admin = false) {
  const post = (path: string, body: unknown) =>
    fetch(`${baseUrl}/api/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  await post('/auth/register', { email, password: PASSWORD, ageConfirmed: true });
  if (admin) await promoteToAdmin(email);
  const body = await (await post('/auth/login', { email, password: PASSWORD })).json();
  return { id: body.data.user.id as string, token: body.data.accessToken as string };
}

const record = (
  userId: string,
  feature: string,
  status: string,
  createdAt: Date,
  tokens: [number, number] = [100, 50],
) => ({
  userId: new mongoose.Types.ObjectId(userId),
  feature,
  provider: 'gemini',
  model: 'test-model',
  status,
  inputTokens: status === 'capped' ? 0 : tokens[0],
  outputTokens: status === 'capped' ? 0 : tokens[1],
  attempts: status === 'capped' ? 0 : 1,
  createdAt,
});

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User.syncIndexes(), RefreshToken.syncIndexes(), UsageRecord.syncIndexes()]);
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  adminToken = (await account('boss@usage.invalid', true)).token;
  const a = await account('amina@usage.invalid');
  amina = a.id;
  userToken = a.token;
  omar = (await account('omar@usage.invalid')).id;

  // Raw inserts so createdAt is exactly what the test says.
  await UsageRecord.collection.insertMany([
    record(amina, 'cv_generation', 'ok', ago(HOUR), [1000, 800]),
    record(amina, 'cv_generation', 'ok', ago(2 * HOUR), [900, 700]),
    record(amina, 'skill_quiz', 'timeout', ago(3 * HOUR), [200, 0]),
    record(amina, 'interview', 'capped', ago(4 * HOUR)),
    record(omar, 'interview', 'ok', ago(2 * DAY), [300, 200]),
    record(omar, 'jd_extraction', 'invalid_output', ago(3 * DAY), [400, 100]),
    record(omar, 'jd_extraction', 'ok', ago(20 * DAY), [500, 100]), // month only
    record(amina, 'cv_generation', 'ok', ago(100 * DAY), [700, 300]), // year only
  ]);
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('admin usage totals match the database for each period', async () => {
  for (const period of ['day', 'week', 'month', 'year'] as const) {
    const res = await call(`/admin/usage?period=${period}`, adminToken);
    assert.equal(res.status, 200);
    const { data } = await res.json();
    const since = new Date(data.since);
    const inPeriod = await UsageRecord.find({ createdAt: { $gte: since } }).lean();
    const sum = (key: 'inputTokens' | 'outputTokens') =>
      inPeriod.reduce((n, r) => n + (r[key] ?? 0), 0);
    assert.deepEqual(
      data.totals,
      {
        requests: inPeriod.length,
        ok: inPeriod.filter((r) => r.status === 'ok').length,
        failed: inPeriod.filter((r) => r.status !== 'ok' && r.status !== 'capped').length,
        capped: inPeriod.filter((r) => r.status === 'capped').length,
        inputTokens: sum('inputTokens'),
        outputTokens: sum('outputTokens'),
        users: new Set(inPeriod.map((r) => String(r.userId))).size,
      },
      period,
    );
    // Per-feature rows add up to the totals; every feature is listed.
    assert.deepEqual(
      data.features.map((f: { feature: string }) => f.feature),
      [...AI_FEATURES],
    );
    assert.equal(
      data.features.reduce((n: number, f: { requests: number }) => n + f.requests, 0),
      data.totals.requests,
    );
  }
});

test('week: per feature, per user (most active first, with email) and the hourly cap', async () => {
  const { data } = await (await call('/admin/usage?period=week', adminToken)).json();
  assert.equal(data.period, 'week');
  assert.equal(data.hourlyCap, env.aiUserRequestsPerHour);
  const cv = data.features.find((f: { feature: string }) => f.feature === 'cv_generation');
  assert.deepEqual(cv, {
    feature: 'cv_generation',
    requests: 2,
    ok: 2,
    failed: 0,
    capped: 0,
    inputTokens: 1900,
    outputTokens: 1500,
  });
  const unused = data.features.find((f: { feature: string }) => f.feature === 'job_match');
  assert.equal(unused.requests, 0);

  assert.deepEqual(
    data.users.map((u: { email: string; requests: number; failed: number; capped: number }) => [
      u.email,
      u.requests,
      u.failed,
      u.capped,
    ]),
    [
      ['amina@usage.invalid', 4, 1, 1],
      ['omar@usage.invalid', 2, 1, 0],
    ],
  );
  assert.equal(data.users[0].userId, amina);
  assert.equal(data.users[1].userId, omar);
  assert.ok(Date.parse(data.users[0].lastAt) > Date.parse(data.users[1].lastAt));
});

test('defaults to week; a bad period is refused; only admins may look', async () => {
  const { data } = await (await call('/admin/usage', adminToken)).json();
  assert.equal(data.period, 'week');
  assert.equal((await call('/admin/usage?period=decade', adminToken)).status, 400);
  assert.equal((await call('/admin/usage', userToken)).status, 403);
  assert.equal((await call('/admin/usage')).status, 401);
});

test('no payment SDK or billing code in the repository (free app)', () => {
  const root = join(__dirname, '..', '..');
  const billing =
    /\b(stripe|paypal|braintree|paddle|lemonsqueezy|chargebee|recurly|adyen|square|razorpay|revenuecat|react-native-purchases|react-native-iap|expo-in-app-purchases|in-app-purchase)\b/i;
  const manifests = [
    'package.json',
    'package-lock.json',
    'backend/package.json',
    'Admin-dashboard/package.json',
    'app-frontend/package.json',
    'packages/shared/package.json',
  ];
  for (const file of manifests) {
    let text: string;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue; // not in this checkout
    }
    const deps = file.endsWith('package-lock.json')
      ? Object.keys(JSON.parse(text).packages ?? {}).join('\n')
      : Object.keys({
          ...JSON.parse(text).dependencies,
          ...JSON.parse(text).devDependencies,
        }).join('\n');
    assert.doesNotMatch(deps, billing, file);
  }
  // No billing code in the server either.
  const srcDir = join(__dirname, '..', 'src');
  const code = readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.ts'))
    .map((f) => readFileSync(join(f.parentPath, f.name), 'utf8'))
    .join('\n');
  assert.doesNotMatch(code, /\b(stripe|paypal|braintree|subscription|checkout|invoice)\b/i);
});
