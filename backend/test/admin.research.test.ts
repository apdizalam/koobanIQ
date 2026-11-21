import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { registerAdapter, unregisterAdapter } from '../src/jobs/sources/registry.js';
import type { NormalizedJob } from '../src/jobs/sources/types.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Job } from '../src/models/Job.js';
import { JobSource } from '../src/models/JobSource.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { Region } from '../src/models/Region.js';
import { ResearchRun } from '../src/models/ResearchRun.js';
import { ResearchSchedule } from '../src/models/ResearchSchedule.js';
import { User } from '../src/models/User.js';
import { ensureDefaultRegions } from '../src/services/jobSourceService.js';
import { researchSettings } from '../src/services/researchService.js';
import { promoteToAdmin } from '../src/services/userService.js';

// TIQ-33 research runs & schedules. Own database per run (dropped at the end);
// two clearly fake sources whose adapters fail or answer as the test says.
const DB_NAME = `kobaniq_test_admin_research_${RUN_ID}`;
const PASSWORD = 'correct-horse-7';
const KEYS = ['adm-a', 'adm-b'];

let server: Server;
let baseUrl: string;
let adminToken: string;
let amina: { id: string; token: string };
let sourcesFail = true;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const call = (path: string, init: { method?: string; body?: unknown; token?: string } = {}) =>
  fetch(`${baseUrl}/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

async function account(email: string, admin = false) {
  await call('/auth/register', {
    method: 'POST',
    body: { email, password: PASSWORD, ageConfirmed: true },
  });
  if (admin) await promoteToAdmin(email);
  const body = await (
    await call('/auth/login', { method: 'POST', body: { email, password: PASSWORD } })
  ).json();
  return { id: body.data.user.id as string, token: body.data.accessToken as string };
}

async function finished(runId: string) {
  for (let i = 0; i < 200; i += 1) {
    const run = await ResearchRun.findById(runId).lean();
    if (run && run.status !== 'running') return run;
    await sleep(20);
  }
  throw new Error('run did not finish');
}

const job = (key: string): NormalizedJob => ({
  sourceKey: key,
  externalId: `${key}-1`,
  title: 'Test job',
  employer: `Test employer ${key}`,
  employerType: 'company',
  region: 'somaliland',
  applyUrl: `https://jobs.example.invalid/${key}/1`,
});

/** Amina's search with the given title filter; waits until it has finished. */
async function aminaSearch(title: string) {
  const res = await call('/research/run', {
    method: 'POST',
    token: amina.token,
    body: { sourceKeys: KEYS, regions: ['somaliland'], filters: { titles: [title] } },
  });
  assert.equal(res.status, 202);
  return finished((await res.json()).data.run.id);
}

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  researchSettings.retryBaseMs = 5;
  await Promise.all([
    Job.syncIndexes(),
    User.syncIndexes(),
    RefreshToken.syncIndexes(),
    JobSource.syncIndexes(),
    Region.syncIndexes(),
    ResearchRun.syncIndexes(),
    ResearchSchedule.syncIndexes(),
    AuditLog.syncIndexes(),
  ]);
  await ensureDefaultRegions();
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  adminToken = (await account('boss@admin-research.invalid', true)).token;
  amina = await account('amina@admin-research.invalid');

  await JobSource.create(
    KEYS.map((key, i) => ({
      key,
      name: `Test source ${key}`,
      type: 'job_board',
      connection: 'api',
      regions: ['somaliland', 'somalia'],
      employerTypes: ['company'],
      enabled: true,
      priority: i,
      termsCheckedAt: new Date(),
    })),
  );
  for (const key of KEYS) {
    registerAdapter({
      key,
      search: async () => {
        if (sourcesFail) throw new Error(`${key} is down`);
        return [job(key)];
      },
    });
  }
});

after(async () => {
  for (const key of KEYS) unregisterAdapter(key);
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('End Test: retry on a failed run creates a new run record (audited)', async () => {
  sourcesFail = true;
  const failed = await aminaSearch('Data officer');
  assert.equal(failed.status, 'failed');

  // The admin list shows it with the user, how it started and the failing sources.
  const list = await (
    await call('/admin/research-runs?status=failed', { token: adminToken })
  ).json();
  const row = list.data.items.find((r: { id: string }) => r.id === String(failed._id));
  assert.equal(row.email, 'amina@admin-research.invalid');
  assert.equal(row.trigger, 'manual');
  assert.deepEqual(row.failedSources.sort(), KEYS);

  sourcesFail = false;
  const res = await call(`/admin/research-runs/${failed._id}/retry`, {
    method: 'POST',
    token: adminToken,
  });
  assert.equal(res.status, 201);
  const retried = (await res.json()).data.run;
  assert.notEqual(retried.id, String(failed._id), 'a new run record');
  assert.equal(retried.retryOf, String(failed._id));

  const done = await finished(retried.id);
  assert.equal(done.status, 'completed');
  assert.equal(String(done.userId), amina.id, 'for the same user');
  assert.deepEqual(done.sourceKeys, KEYS, 'same sources');
  assert.deepEqual(done.regions, ['somaliland'], 'same regions');
  assert.deepEqual(done.filters?.titles, ['Data officer'], 'same filters');

  // The old run stays as it was; its detail lists the retry.
  const detail = await (
    await call(`/admin/research-runs/${failed._id}`, { token: adminToken })
  ).json();
  assert.equal(detail.data.run.status, 'failed');
  assert.equal(detail.data.run.perSource.length, 2);
  assert.ok(detail.data.run.perSource.every((p: { error: string }) => p.error));
  assert.deepEqual(
    detail.data.run.retries.map((r: { id: string }) => r.id),
    [retried.id],
  );

  const audit = await AuditLog.findOne({ action: 'research_run.retry' }).lean();
  assert.equal(audit?.targetId, amina.id);
  assert.deepEqual(audit?.before, { run: String(failed._id), status: 'failed' });
  assert.deepEqual(audit?.after, { run: retried.id, status: 'running' });

  // The new run shows as a retry in the list.
  const again = await (await call('/admin/research-runs', { token: adminToken })).json();
  assert.equal(again.data.items[0].id, retried.id);
  assert.equal(again.data.items[0].trigger, 'retry');
});

test('a run that went well cannot be retried; nor one of a suspended user', async () => {
  sourcesFail = false;
  const ok = await aminaSearch('Teacher');
  assert.equal(ok.status, 'completed');
  const res = await call(`/admin/research-runs/${ok._id}/retry`, {
    method: 'POST',
    token: adminToken,
  });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'RUN_NOT_RETRYABLE');

  sourcesFail = true;
  const failed = await aminaSearch('Nurse');
  await User.updateOne({ _id: amina.id }, { status: 'suspended' });
  const refused = await call(`/admin/research-runs/${failed._id}/retry`, {
    method: 'POST',
    token: adminToken,
  });
  assert.equal(refused.status, 409);
  assert.equal((await refused.json()).error.code, 'ACCOUNT_SUSPENDED');
  await User.updateOne({ _id: amina.id }, { status: 'active' });
  amina = await account('amina@admin-research.invalid'); // a fresh sign-in for the next tests

  assert.equal((await call('/admin/research-runs/not-an-id', { token: adminToken })).status, 404);
  assert.equal(
    (await call('/admin/research-runs?status=sleeping', { token: adminToken })).status,
    400,
  );
});

test('pausing and resuming a schedule (audited, no record when nothing changes)', async () => {
  const schedule = await ResearchSchedule.create({
    userId: amina.id,
    frequency: 'daily',
    time: '08:00',
    timeZone: 'Africa/Mogadishu',
    sourceKeys: KEYS,
    regions: ['somaliland'],
    enabled: true,
    nextRunAt: new Date(Date.now() + 3_600_000),
  });

  const list = await (await call('/admin/research-schedules', { token: adminToken })).json();
  assert.equal(list.data.total, 1);
  assert.equal(list.data.items[0].email, 'amina@admin-research.invalid');
  assert.equal(list.data.items[0].enabled, true);

  const pause = () =>
    call(`/admin/research-schedules/${schedule._id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { enabled: false },
    });
  const paused = await (await pause()).json();
  assert.equal(paused.data.schedule.enabled, false);
  assert.equal(paused.data.schedule.nextRunAt, null, 'no more runs');
  await pause(); // already paused: no second record
  assert.equal(await AuditLog.countDocuments({ action: 'research_schedule.pause' }), 1);

  const resumed = await (
    await call(`/admin/research-schedules/${schedule._id}`, {
      method: 'PATCH',
      token: adminToken,
      body: { enabled: true },
    })
  ).json();
  assert.equal(resumed.data.schedule.enabled, true);
  assert.ok(Date.parse(resumed.data.schedule.nextRunAt) > Date.now(), 'next run from now');
  const audit = await AuditLog.findOne({ action: 'research_schedule.resume' }).lean();
  assert.equal(audit?.targetId, amina.id);
  assert.deepEqual(audit?.after, { schedule: String(schedule._id), enabled: true });

  const bad = await call(`/admin/research-schedules/${schedule._id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { enabled: 'yes' },
  });
  assert.equal(bad.status, 400);
});

test('only admins may see or change runs and schedules', async () => {
  for (const [method, path] of [
    ['GET', '/admin/research-runs'],
    ['GET', '/admin/research-schedules'],
    ['POST', `/admin/research-runs/${new mongoose.Types.ObjectId()}/retry`],
  ]) {
    assert.equal((await call(path, { method, token: amina.token })).status, 403, path);
  }
});
