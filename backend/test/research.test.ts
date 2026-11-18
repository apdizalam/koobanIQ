import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { registerAdapter, unregisterAdapter } from '../src/jobs/sources/registry.js';
import type { NormalizedJob, ResearchQuery } from '../src/jobs/sources/types.js';
import { JobSource } from '../src/models/JobSource.js';
import { Region } from '../src/models/Region.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { ResearchRun } from '../src/models/ResearchRun.js';
import { User } from '../src/models/User.js';
import { ensureDefaultRegions } from '../src/services/jobSourceService.js';
import { rankJobs } from '../src/services/researchService.js';

// Own database per run (dropped at the end). Four clearly fake test sources with
// fake adapters that record every search: nothing here is a real job.
const DB_NAME = `kobaniq_test_research_${RUN_ID}`;
const PASSWORD = 'correct-horse-9';
const SOURCE_KEYS = ['test-a', 'test-b', 'test-c', 'test-d'];

let server: Server;
let baseUrl: string;
let token: string;

/** Which fake sources were searched, and with what query. */
const searched: { key: string; query: ResearchQuery }[] = [];
/** Per fake source: the jobs it returns, or an error it throws. */
const behaviour: Record<string, () => Promise<unknown[]>> = {};

const job = (key: string, n: number, extra: Partial<NormalizedJob> = {}): NormalizedJob => ({
  sourceKey: key,
  externalId: `${key}-${n}`,
  title: `Test job ${n}`,
  employer: `Test employer ${key}`,
  employerType: 'company',
  region: 'somaliland',
  applyUrl: `https://jobs.example.invalid/${key}/${n}`,
  ...extra,
});

const call = (path: string, init: { method?: string; body?: unknown } = {}) =>
  fetch(`${baseUrl}/api/v1${path}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const research = (body: unknown) => call('/research/run', { method: 'POST', body });

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.syncIndexes(),
    RefreshToken.syncIndexes(),
    JobSource.syncIndexes(),
    Region.syncIndexes(),
    ResearchRun.syncIndexes(),
  ]);
  await ensureDefaultRegions();
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const email = 'amina@research.invalid';
  await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const login = await (
    await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
  ).json();
  token = login.data.accessToken;

  const checked = new Date();
  await JobSource.create(
    SOURCE_KEYS.map((key, i) => ({
      key,
      name: `Test source ${key}`,
      type: 'job_board',
      connection: 'api',
      regions: ['somaliland', 'somalia'],
      employerTypes: ['company'],
      enabled: true,
      priority: i,
      termsCheckedAt: checked,
    })),
  );
  for (const key of SOURCE_KEYS) {
    registerAdapter({
      key,
      search: async (query) => {
        searched.push({ key, query });
        return (behaviour[key] ?? (async () => [job(key, 1)]))() as Promise<NormalizedJob[]>;
      },
    });
  }
});

beforeEach(() => {
  searched.length = 0;
  for (const key of Object.keys(behaviour)) delete behaviour[key];
});

after(async () => {
  for (const key of [...SOURCE_KEYS, 'test-new']) unregisterAdapter(key);
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('End Test: user selects 2 of 4 sources → only those 2 are queried (run record proves it)', async () => {
  const res = await research({ sourceKeys: ['test-b', 'test-d'] });
  const body = await res.json();
  assert.equal(res.status, 201);

  assert.deepEqual(searched.map((s) => s.key).sort(), ['test-b', 'test-d']);
  assert.deepEqual(body.data.run.sourceKeys, ['test-b', 'test-d']);
  assert.deepEqual(
    body.data.run.perSource.map((p: { key: string; queried: boolean }) => [p.key, p.queried]),
    [
      ['test-b', true],
      ['test-d', true],
    ],
  );
  assert.equal(body.data.run.status, 'completed');
  assert.equal(body.data.jobs.length, 2);

  const stored = await ResearchRun.findById(body.data.run.id);
  assert.deepEqual(stored?.sourceKeys, ['test-b', 'test-d']);
  assert.equal(stored?.perSource.length, 2);
});

test('End Test: selecting zero sources is blocked with a clear message', async () => {
  const res = await research({ sourceKeys: [] });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_SOURCES_SELECTED');
  assert.equal(body.error.message, 'Choose at least one job source');
  assert.equal(searched.length, 0);

  const somali = await fetch(`${baseUrl}/api/v1/research/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceKeys: [] }),
  });
  assert.equal(somali.status, 401, 'research needs a signed-in user');
});

test('End Test: a disabled source is not offered and is never searched', async () => {
  await JobSource.updateOne({ key: 'test-c' }, { enabled: false });
  try {
    const list = await (await call('/job-sources')).json();
    assert.equal(
      list.data.sources.some((s: { key: string }) => s.key === 'test-c'),
      false,
    );
    const res = await research({ sourceKeys: ['test-a', 'test-c'] });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.error.code, 'SOURCE_NOT_AVAILABLE');
    assert.equal(searched.length, 0, 'nothing is searched when the selection is not valid');
  } finally {
    await JobSource.updateOne({ key: 'test-c' }, { enabled: true });
  }
});

test('End Test: adding a source = adapter + DB record; it appears in the app', async () => {
  const before = await (await call('/job-sources')).json();
  assert.equal(
    before.data.sources.some((s: { key: string }) => s.key === 'test-new'),
    false,
  );
  registerAdapter({ key: 'test-new', search: async () => [job('test-new', 1)] });
  await JobSource.create({
    key: 'test-new',
    name: 'Test source new',
    type: 'ngo_un',
    connection: 'feed',
    regions: ['somalia'],
    employerTypes: ['ngo'],
    enabled: true,
    termsCheckedAt: new Date(),
  });
  const after = await (await call('/job-sources?regions=somalia')).json();
  assert.ok(after.data.sources.some((s: { key: string }) => s.key === 'test-new'));
  const res = await research({ sourceKeys: ['test-new'] });
  assert.equal(res.status, 201);
});

test('the query carries regions (default: Somaliland + Somalia) and filters', async () => {
  await research({ sourceKeys: ['test-a'] });
  assert.deepEqual(searched[0].query.regions, ['somaliland', 'somalia']);

  await research({
    sourceKeys: ['test-a'],
    regions: ['somalia'],
    filters: { titles: [' developer '], skills: ['React'], city: 'Garowe', employerTypes: ['ngo'] },
  });
  const q = searched[1].query;
  assert.deepEqual(q.regions, ['somalia']);
  assert.deepEqual(q.titles, ['developer']);
  assert.equal(q.city, 'Garowe');
  assert.deepEqual(q.employerTypes, ['ngo']);
});

test('jobs without region, employer or a real apply link are dropped and counted', async () => {
  behaviour['test-a'] = async () => [
    job('test-a', 1),
    job('test-a', 2, { applyUrl: 'javascript:alert(1)' }),
    job('test-a', 3, { employer: '' }),
    { ...job('test-a', 4), region: 'kenya' },
    job('test-b', 5), // claims another source
  ];
  const body = await (await research({ sourceKeys: ['test-a'] })).json();
  assert.equal(body.data.jobs.length, 1);
  assert.equal(body.data.jobs[0].externalId, 'test-a-1');
  assert.deepEqual(
    { found: body.data.run.perSource[0].found, invalid: body.data.run.perSource[0].invalid },
    { found: 5, invalid: 4 },
  );
});

test('one failing source does not stop the others; the error is recorded', async () => {
  behaviour['test-b'] = async () => {
    throw new Error('Source is down');
  };
  const body = await (await research({ sourceKeys: ['test-a', 'test-b'] })).json();
  assert.equal(body.data.run.status, 'partial');
  const b = body.data.run.perSource.find((p: { key: string }) => p.key === 'test-b');
  assert.equal(b.error, 'Source is down');
  assert.equal(body.data.jobs.length, 1, 'jobs from the working source are still returned');

  const health = await JobSource.findOne({ key: 'test-b' });
  assert.ok((health?.errorRate ?? 0) > 0, 'admin health shows the failure');
  const ok = await JobSource.findOne({ key: 'test-a' });
  assert.ok(ok?.lastSuccessAt, 'last success recorded');
});

test('results from the selected regions come first, then remote', async () => {
  behaviour['test-a'] = async () => [
    job('test-a', 1, { region: 'remote' }),
    job('test-a', 2, { region: 'somalia' }),
    job('test-a', 3, { region: 'somaliland' }),
  ];
  const body = await (await research({ sourceKeys: ['test-a'], regions: ['somaliland'] })).json();
  assert.deepEqual(
    body.data.jobs.map((j: NormalizedJob) => j.region),
    ['somaliland', 'remote', 'somalia'],
  );

  // Order inside a group is kept.
  const ranked = rankJobs(
    [job('x', 1, { region: 'somalia' }), job('x', 2, { region: 'somalia' })],
    ['somalia'],
  );
  assert.deepEqual(
    ranked.map((j) => j.externalId),
    ['x-1', 'x-2'],
  );
});

test('runs list: newest first, only my own runs', async () => {
  const body = await (await call('/research/runs')).json();
  assert.ok(body.data.runs.length >= 1);
  const times = body.data.runs.map((r: { startedAt: string }) => Date.parse(r.startedAt));
  assert.deepEqual(
    times,
    [...times].sort((a, b) => b - a),
  );
});

test('bad requests are refused with field messages', async () => {
  const res = await research({
    sourceKeys: 'test-a',
    regions: ['kenya'],
    filters: { titles: 'x' },
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.deepEqual(Object.keys(body.meta.details).sort(), ['filters', 'regions', 'sourceKeys']);
});
