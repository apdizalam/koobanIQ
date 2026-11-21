import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { registerAdapter, unregisterAdapter } from '../src/jobs/sources/registry.js';
import type { NormalizedJob } from '../src/jobs/sources/types.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { nextRunAfter } from '../src/lib/zonedTime.js';
import { Job } from '../src/models/Job.js';
import { JobSource } from '../src/models/JobSource.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { ResearchRun } from '../src/models/ResearchRun.js';
import { ResearchSchedule } from '../src/models/ResearchSchedule.js';
import { User } from '../src/models/User.js';
import { researchSettings } from '../src/services/researchService.js';
import { MAX_SCHEDULES, runDueSchedules } from '../src/services/scheduleService.js';
import { RUN_ID } from './support/testRun.js';

// TIQ-21: scheduled job searches. Own database per run; fictional people; fake sources only.
const DB_NAME = `kobaniq_test_schedules_${RUN_ID}`;
const PASSWORD = 'correct-horse-21s';

let server: Server;
let baseUrl: string;
let amina: string;
let hodan: string;
let aminaId: mongoose.Types.ObjectId;
let searches = 0;

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

const job = (n: number): NormalizedJob => ({
  sourceKey: 'sched-board',
  externalId: `sched-${n}`,
  title: 'Data Officer',
  employer: `Example Relief Org ${n}`,
  employerType: 'ngo',
  region: 'somaliland',
  city: 'Hargeisa',
  applyUrl: `https://jobs.example.invalid/apply/${n}`,
});

/** Waits until the user's background search has finished (one search at a time per user). */
async function settle() {
  for (let i = 0; i < 200; i += 1) {
    if (!(await ResearchRun.exists({ status: 'running' }))) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

const body = (over: Record<string, unknown> = {}) => ({
  frequency: 'daily',
  time: '09:00',
  timeZone: 'Europe/Istanbul',
  sourceKeys: ['sched-board'],
  regions: ['somaliland'],
  ...over,
});

before(async () => {
  researchSettings.retryBaseMs = 5;
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all(
    [User, RefreshToken, Job, JobSource, ResearchRun, ResearchSchedule].map((m) => m.syncIndexes()),
  );
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  amina = await account('amina@schedule.invalid');
  hodan = await account('hodan@schedule.invalid');
  aminaId = (await User.findOne({ email: 'amina@schedule.invalid' }))!._id;
  registerAdapter({
    key: 'sched-board',
    search: async () => {
      searches += 1;
      return [job(searches)];
    },
  });
  await JobSource.create({
    key: 'sched-board',
    name: 'Schedule test board',
    type: 'job_board',
    connection: 'api',
    regions: ['somaliland'],
    employerTypes: ['ngo'],
    enabled: true,
    termsCheckedAt: new Date(),
  });
});

after(async () => {
  unregisterAdapter('sched-board');
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('End Test: a daily 09:00 Istanbul schedule fires at 06:00 UTC', () => {
  const timing = { frequency: 'daily' as const, time: '09:00', timeZone: 'Europe/Istanbul' };
  const iso = (after: string) => nextRunAfter(timing, new Date(after)).toISOString();
  assert.equal(iso('2026-11-20T05:00:00Z'), '2026-11-20T06:00:00.000Z');
  assert.equal(iso('2026-11-20T06:00:00Z'), '2026-11-21T06:00:00.000Z'); // never the same instant
  const mog = (frequency: 'hourly' | 'every6h' | 'weekly', time: string, weekday?: number) =>
    nextRunAfter(
      { frequency, time, weekday, timeZone: 'Africa/Mogadishu' },
      new Date('2026-11-20T10:30:00Z'), // Friday 13:30 local
    ).toISOString();
  assert.equal(mog('hourly', '00:20'), '2026-11-20T11:20:00.000Z'); // 14:20 local
  assert.equal(mog('every6h', '08:00'), '2026-11-20T11:00:00.000Z'); // 02/08/14/20 → 14:00
  assert.equal(mog('weekly', '07:00', 0), '2026-11-23T04:00:00.000Z'); // Monday 07:00
});

test('create: timing and sources are checked; the first run is the next local time', async () => {
  for (const bad of [
    { frequency: 'monthly' },
    { time: '25:00' },
    { timeZone: 'Mars/Olympus' },
    { weekday: 9, frequency: 'weekly' },
  ]) {
    const res = await call(amina, 'POST', '/research/schedules', body(bad));
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
  const unknown = await call(amina, 'POST', '/research/schedules', body({ sourceKeys: ['nope'] }));
  assert.equal(unknown.body.error.code, 'SOURCE_NOT_AVAILABLE');

  const created = await call(amina, 'POST', '/research/schedules', body());
  assert.equal(created.status, 201);
  const s = created.body.data.schedule;
  assert.equal(s.enabled, true);
  const next = new Date(s.nextRunAt);
  assert.ok(next > new Date() && next.getTime() - Date.now() <= 24 * 3600 * 1000);
  assert.equal(next.getUTCHours(), 6); // 09:00 in Istanbul
  assert.equal(next.getUTCMinutes(), 0);
  const list = await call(amina, 'GET', '/research/schedules');
  assert.equal(list.body.data.schedules.length, 1);
  await ResearchSchedule.deleteMany({});
});

test('End Test: a due schedule runs once; the run is in the run history with its schedule', async () => {
  const { body: b } = await call(amina, 'POST', '/research/schedules', body());
  const id = b.data.schedule.id;
  const now = new Date();
  await ResearchSchedule.updateOne({ _id: id }, { nextRunAt: new Date(now.getTime() - 60_000) });

  assert.equal(await runDueSchedules(now), 1);
  // A second tick at the same time starts nothing (the schedule was claimed and moved on).
  assert.equal(await runDueSchedules(now), 0);
  await settle();

  const schedule = await ResearchSchedule.findById(id);
  assert.equal(schedule!.runCount, 1);
  assert.ok(schedule!.nextRunAt! > now);
  assert.equal(schedule!.lastSkip, null);
  const runs = await call(amina, 'GET', '/research/runs');
  const run = runs.body.data.runs.find((r: Json) => r.scheduleId === id);
  assert.ok(run, 'scheduled run listed in the history');
  assert.equal(run.status, 'completed');
  assert.equal(String(schedule!.lastRunId), run.id);
  assert.deepEqual(run.sourceKeys, ['sched-board']);
  await ResearchSchedule.deleteMany({});
});

test('End Test: switching a schedule off stops its next run; on again plans the next one', async () => {
  const { body: b } = await call(
    amina,
    'POST',
    '/research/schedules',
    body({ frequency: 'hourly' }),
  );
  const id = b.data.schedule.id;
  const off = await call(amina, 'PATCH', `/research/schedules/${id}`, { enabled: false });
  assert.equal(off.body.data.schedule.enabled, false);
  assert.equal(off.body.data.schedule.nextRunAt, null);

  // Even long after its time, a switched-off schedule never runs.
  const before = await ResearchRun.countDocuments({ scheduleId: id });
  assert.equal(await runDueSchedules(new Date(Date.now() + 7 * 24 * 3600 * 1000)), 0);
  assert.equal(await ResearchRun.countDocuments({ scheduleId: id }), before);

  const on = await call(amina, 'PATCH', `/research/schedules/${id}`, {
    enabled: true,
    frequency: 'weekly',
    weekday: 2,
    time: '07:30',
  });
  assert.equal(on.body.data.schedule.enabled, true);
  assert.equal(on.body.data.schedule.frequency, 'weekly');
  assert.ok(new Date(on.body.data.schedule.nextRunAt) > new Date());
  await ResearchSchedule.deleteMany({});
});

test('a source switched off by an admin is skipped by schedules; nothing left = skipped with the reason', async () => {
  const { body: b } = await call(amina, 'POST', '/research/schedules', body());
  const id = b.data.schedule.id;
  await JobSource.updateOne({ key: 'sched-board' }, { enabled: false });
  const now = new Date();
  await ResearchSchedule.updateOne({ _id: id }, { nextRunAt: new Date(now.getTime() - 1000) });
  const runsBefore = await ResearchRun.countDocuments();
  assert.equal(await runDueSchedules(now), 0);
  assert.equal(await ResearchRun.countDocuments(), runsBefore);
  const skipped = await ResearchSchedule.findById(id);
  assert.equal(skipped!.lastSkip, 'no_sources');
  assert.ok(skipped!.nextRunAt! > now, 'it tries again next time');
  await JobSource.updateOne({ key: 'sched-board' }, { enabled: true });

  // A search of the user still running: this time is skipped ("busy"), never doubled.
  await ResearchRun.create({
    userId: aminaId,
    status: 'running',
    sourceKeys: ['sched-board'],
    regions: ['somaliland'],
    startedAt: new Date(),
  });
  await ResearchSchedule.updateOne({ _id: id }, { nextRunAt: new Date(now.getTime() - 1000) });
  assert.equal(await runDueSchedules(now), 0);
  assert.equal((await ResearchSchedule.findById(id))!.lastSkip, 'busy');
  await ResearchRun.deleteMany({ status: 'running' });
  await ResearchSchedule.deleteMany({});
});

test('limit per user, and schedules are private', async () => {
  const ids: string[] = [];
  for (let i = 0; i < MAX_SCHEDULES; i += 1) {
    const res = await call(amina, 'POST', '/research/schedules', body({ time: `0${i}:15` }));
    assert.equal(res.status, 201);
    ids.push(res.body.data.schedule.id);
  }
  const extra = await call(amina, 'POST', '/research/schedules', body());
  assert.equal(extra.status, 409);
  assert.equal(extra.body.error.code, 'SCHEDULE_LIMIT');

  assert.equal(
    (await call(hodan, 'PATCH', `/research/schedules/${ids[0]}`, { enabled: false })).status,
    404,
  );
  assert.equal((await call(hodan, 'DELETE', `/research/schedules/${ids[0]}`)).status, 404);
  assert.equal((await call(hodan, 'GET', '/research/schedules')).body.data.schedules.length, 0);
  assert.equal((await call(amina, 'DELETE', `/research/schedules/${ids[0]}`)).status, 204);
  assert.equal(await ResearchSchedule.countDocuments({ userId: aminaId }), MAX_SCHEDULES - 1);
});
