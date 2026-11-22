import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import type { NormalizedJob } from '../src/jobs/sources/types.js';
import { saveJobs } from '../src/jobs/store.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Job } from '../src/models/Job.js';
import { JobMatch } from '../src/models/JobMatch.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { SavedJob } from '../src/models/SavedJob.js';
import { User } from '../src/models/User.js';
import { promoteToAdmin } from '../src/services/userService.js';

// TIQ-33 jobs & matching. Own database per run (dropped at the end); clearly
// fake jobs on .invalid links, fictional users.
const DB_NAME = `kobaniq_test_admin_jobs_${RUN_ID}`;
const PASSWORD = 'correct-horse-6';

let server: Server;
let baseUrl: string;
let admin: string;
let amina: { id: string; token: string };
let ids: string[] = [];

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
  return { id: body.data.user.id as string, token: body.data.accessToken as string };
}

const job = (n: number, over: Partial<NormalizedJob> = {}): NormalizedJob => ({
  sourceKey: n === 3 ? 'board-b' : 'board-a',
  externalId: `admin-job-${n}`,
  title: `Data Officer ${n}`,
  employer: `Example Relief Org ${n}`,
  employerType: 'ngo',
  region: 'somaliland',
  city: 'Hargeisa',
  applyUrl: `https://jobs.example.invalid/admin/${n}`,
  ...over,
});

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all(
    [User, RefreshToken, Job, JobMatch, SavedJob, AuditLog].map((m) => m.syncIndexes()),
  );
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = (await account('boss@admin-jobs.invalid', true)).token;
  amina = await account('amina@admin-jobs.invalid');

  const past = new Date(Date.now() - 5 * 24 * 3600_000);
  const result = await saveJobs([
    job(1),
    job(2),
    job(3),
    job(4, { title: 'Old Data Officer', deadline: past.toISOString() as unknown as Date }),
  ]);
  ids = result.ids.map(String);
  // Amina was matched for job 1 (strong) and saved it.
  await JobMatch.collection.insertOne({
    userId: new mongoose.Types.ObjectId(amina.id),
    jobId: new mongoose.Types.ObjectId(ids[0]),
    score: 82,
    category: 'strong',
    recommended: true,
    matchedSkills: ['Excel'],
    missingRequired: ['SQL'],
    missingPreferred: [],
    userLevel: 'junior',
    levelConfidence: 'confident',
    relevantYears: 2,
    requiredYears: 2,
    jobLevel: 'junior',
    levelFit: 'fits',
    reasons: [],
    computedAt: new Date(),
  });
  await call(amina.token, `/jobs/${ids[0]}/save`, { method: 'PUT' });
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('the list shows jobs by state and source, with matches and saves', async () => {
  const { body } = await call(admin, '/admin/jobs');
  assert.equal(body.data.total, 4);
  assert.equal(body.data.summary.active, 3);
  assert.equal(body.data.summary.expired, 1);
  assert.equal(body.data.summary.removed, 0);
  assert.deepEqual(body.data.summary.bySource, [
    { sourceKey: 'board-a', active: 2 },
    { sourceKey: 'board-b', active: 1 },
  ]);
  const first = body.data.items.find((i: Json) => i.id === ids[0]);
  assert.equal(first.state, 'active');
  assert.equal(first.matches, 1);
  assert.equal(first.strongMatches, 1);
  assert.equal(first.saved, 1);
  assert.equal(body.data.items.find((i: Json) => i.id === ids[3]).state, 'expired');

  const b = await call(admin, '/admin/jobs?source=board-b');
  assert.deepEqual(
    b.body.data.items.map((i: Json) => i.id),
    [ids[2]],
  );
  const q = await call(admin, '/admin/jobs?q=old%20data');
  assert.deepEqual(
    q.body.data.items.map((i: Json) => i.id),
    [ids[3]],
  );
  assert.equal((await call(admin, '/admin/jobs?state=gone')).status, 400);
});

test('the detail explains each match (score, level fit, skills found and missing)', async () => {
  const { body } = await call(admin, `/admin/jobs/${ids[0]}`);
  const m = body.data.job.matches[0];
  assert.equal(m.email, 'amina@admin-jobs.invalid');
  assert.equal(m.score, 82);
  assert.equal(m.category, 'strong');
  assert.equal(m.levelFit, 'fits');
  assert.deepEqual(m.matchedSkills, ['Excel']);
  assert.deepEqual(m.missingRequired, ['SQL']);
  assert.equal(body.data.job.saved, 1);
  assert.equal((await call(admin, '/admin/jobs/nope')).status, 404);
});

test('removing a job hides it from users; finding it again keeps it removed; restore', async () => {
  const removed = await call(admin, `/admin/jobs/${ids[0]}/remove`, {
    method: 'POST',
    body: { reason: 'invalid' },
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.data.job.state, 'removed');
  assert.equal(removed.body.data.job.removedBy, 'boss@admin-jobs.invalid');

  // The user no longer sees it anywhere.
  const search = (await call(amina.token, '/jobs/search?lower=1')).body.data;
  const seen = [...search.recommended, ...search.lowerMatch].map((r: Json) => r.job.id);
  assert.ok(!seen.includes(ids[0]), 'not in search');
  assert.ok(seen.includes(ids[1]), 'other jobs still found');
  assert.equal((await call(amina.token, `/jobs/${ids[0]}`)).status, 404, 'job page gone');
  assert.deepEqual((await call(amina.token, '/jobs/saved')).body.data.jobs, [], 'not in saved');

  // A later search finding the same job again does not bring it back.
  await saveJobs([job(1)]);
  assert.ok((await Job.findById(ids[0]))?.removedAt, 'still removed');

  const audit = await AuditLog.findOne({ action: 'job.remove' }).lean();
  assert.equal(audit?.targetId, ids[0]);
  assert.deepEqual(audit?.after, { title: 'Data Officer 1', removed: true, reason: 'invalid' });

  const restored = await call(admin, `/admin/jobs/${ids[0]}/restore`, { method: 'POST' });
  assert.equal(restored.body.data.job.state, 'active');
  assert.equal((await call(amina.token, `/jobs/${ids[0]}`)).status, 200, 'visible again');
  assert.equal((await call(amina.token, '/jobs/saved')).body.data.jobs.length, 1);
  assert.equal(await AuditLog.countDocuments({ action: 'job.restore' }), 1);

  const bad = await call(admin, `/admin/jobs/${ids[1]}/remove`, {
    method: 'POST',
    body: { reason: 'boring' },
  });
  assert.equal(bad.status, 400);
});

test('remove all expired jobs at once (audited with the count); only admins', async () => {
  const res = await call(admin, '/admin/jobs/remove-expired', { method: 'POST' });
  assert.deepEqual(res.body.data, { removed: 1 });
  const old = await Job.findById(ids[3]).lean();
  assert.equal(old?.removedReason, 'expired');
  const again = await call(admin, '/admin/jobs/remove-expired', { method: 'POST' });
  assert.deepEqual(again.body.data, { removed: 0 });
  assert.equal(await AuditLog.countDocuments({ action: 'job.remove_expired' }), 1);

  assert.equal((await call(amina.token, '/admin/jobs')).status, 403);
  assert.equal(
    (
      await call(amina.token, `/admin/jobs/${ids[1]}/remove`, {
        method: 'POST',
        body: { reason: 'invalid' },
      })
    ).status,
    403,
  );
});
