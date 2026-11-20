import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { JobSource } from '../src/models/JobSource.js';
import { Region } from '../src/models/Region.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import { registerAdapter, unregisterAdapter } from '../src/jobs/sources/registry.js';
import { ensureDefaultRegions } from '../src/services/jobSourceService.js';
import { promoteToAdmin } from '../src/services/userService.js';

// Own database per run (dropped at the end): the catalog here must not mix with
// other test files or CI jobs. Sources are clearly fake test records; no real
// source is enabled without a terms check (doc 9 §3).
const DB_NAME = `kobaniq_test_sources_${RUN_ID}`;
const PASSWORD = 'correct-horse-8';

let server: Server;
let baseUrl: string;
let adminToken: string;
let userToken: string;

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
  return body.data.accessToken as string;
}

const testSource = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  name: `Test source ${key}`,
  type: 'job_board',
  connection: 'api',
  regions: ['somaliland'],
  employerTypes: ['company'],
  ...extra,
});

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.syncIndexes(),
    RefreshToken.syncIndexes(),
    AuditLog.syncIndexes(),
    JobSource.syncIndexes(),
    Region.syncIndexes(),
  ]);
  await ensureDefaultRegions();
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  adminToken = await account('boss@sources.invalid', true);
  userToken = await account('amina@sources.invalid');

  const checked = new Date();
  await JobSource.create([
    testSource('test-sl-board', { enabled: true, priority: 10, termsCheckedAt: checked }),
    testSource('test-so-ngo', {
      type: 'ngo_un',
      regions: ['somalia'],
      employerTypes: ['ngo', 'un_agency'],
      enabled: true,
      priority: 5,
      termsCheckedAt: checked,
    }),
    testSource('test-remote', {
      regions: ['remote'],
      enabled: true,
      priority: 20,
      termsCheckedAt: checked,
    }),
    testSource('test-unchecked', {
      regions: ['somalia'],
      termsUrl: 'https://example.invalid/terms',
    }),
    // Terms checked, but the server has no adapter for it.
    testSource('test-no-adapter', { regions: ['somalia'], termsCheckedAt: checked }),
  ]);
  // A source = adapter in the server + DB record (doc 9 §7); fake adapters here.
  for (const key of FAKE_ADAPTER_KEYS) {
    registerAdapter({ key, search: async () => [] });
  }
});

const FAKE_ADAPTER_KEYS = ['test-sl-board', 'test-so-ngo', 'test-remote', 'test-unchecked'];

after(async () => {
  for (const key of FAKE_ADAPTER_KEYS) unregisterAdapter(key);
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('regions: Somaliland and Somalia are separate, with doc 9 city lists', async () => {
  const res = await call('/regions', { token: userToken });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(
    body.data.regions.map((r: { key: string }) => r.key),
    ['somaliland', 'somalia', 'remote'],
  );
  assert.ok(body.data.regions[0].cities.includes('Hargeisa'));
  assert.ok(body.data.regions[1].cities.includes('Mogadishu'));
  assert.equal((await call('/regions')).status, 401, 'needs a signed-in user');
});

test('seeding twice never overwrites cities an admin changed', async () => {
  await Region.updateOne({ key: 'remote' }, { cities: ['Kept by admin'] });
  await ensureDefaultRegions();
  const remote = await Region.findOne({ key: 'remote' });
  assert.deepEqual(remote?.cities, ['Kept by admin']);
  await Region.updateOne({ key: 'remote' }, { cities: [] });
});

test('app list: enabled sources only, filtered by region, in priority order', async () => {
  const all = await (await call('/job-sources', { token: userToken })).json();
  assert.deepEqual(
    all.data.sources.map((s: { key: string }) => s.key),
    ['test-so-ngo', 'test-sl-board', 'test-remote'],
    'disabled source hidden; ordered by priority',
  );
  assert.equal('termsCheckedAt' in all.data.sources[0], false, 'no admin fields for the app');

  const somaliland = await (
    await call('/job-sources?regions=somaliland', { token: userToken })
  ).json();
  assert.deepEqual(
    somaliland.data.sources.map((s: { key: string }) => s.key),
    ['test-sl-board'],
  );

  const both = await (
    await call('/job-sources?regions=somaliland,somalia', { token: userToken })
  ).json();
  assert.deepEqual(both.data.sources.map((s: { key: string }) => s.key).sort(), [
    'test-sl-board',
    'test-so-ngo',
  ]);

  const bad = await call('/job-sources?regions=kenya', { token: userToken });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'VALIDATION_ERROR');
});

test('admin list shows every source with health and the terms check; users get 403', async () => {
  const res = await (await call('/admin/job-sources', { token: adminToken })).json();
  const keys = res.data.sources.map((s: { key: string }) => s.key);
  assert.ok(keys.includes('test-unchecked'));
  const unchecked = res.data.sources.find((s: { key: string }) => s.key === 'test-unchecked');
  assert.equal(unchecked.enabled, false);
  assert.equal(unchecked.termsCheckedAt, null);
  // Why a source can't be searched is shown to admins; the app's "status" is not.
  assert.equal(unchecked.listed, false);
  assert.equal(unchecked.unavailableReason, null);
  assert.equal('status' in unchecked, false);
  assert.equal((await call('/admin/job-sources', { token: userToken })).status, 403);
});

test('a source whose terms were not checked cannot be enabled', async () => {
  const res = await call('/admin/job-sources/test-unchecked', {
    method: 'PATCH',
    token: adminToken,
    body: { enabled: true },
  });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'SOURCE_TERMS_NOT_CHECKED');
  assert.equal((await JobSource.findOne({ key: 'test-unchecked' }))?.enabled, false);
});

test('a source without an adapter in the server cannot be enabled', async () => {
  const res = await call('/admin/job-sources/test-no-adapter', {
    method: 'PATCH',
    token: adminToken,
    body: { enabled: true },
  });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error.code, 'SOURCE_ADAPTER_MISSING');
  const list = await (await call('/admin/job-sources', { token: adminToken })).json();
  const row = list.data.sources.find((s: { key: string }) => s.key === 'test-no-adapter');
  assert.equal(row.hasAdapter, false);
});

test('disabling a source hides it from the app at once and is audited', async () => {
  const res = await call('/admin/job-sources/test-remote', {
    method: 'PATCH',
    token: adminToken,
    body: { enabled: false },
  });
  assert.equal(res.status, 200);
  const list = await (await call('/job-sources', { token: userToken })).json();
  assert.equal(
    list.data.sources.some((s: { key: string }) => s.key === 'test-remote'),
    false,
  );

  const log = await AuditLog.findOne({ action: 'job_source.disable', targetId: 'test-remote' });
  assert.ok(log, 'audited');
  assert.equal((log?.before as { enabled: boolean }).enabled, true);
  assert.equal((log?.after as { enabled: boolean }).enabled, false);

  const back = await call('/admin/job-sources/test-remote', {
    method: 'PATCH',
    token: adminToken,
    body: { enabled: true },
  });
  assert.equal(back.status, 200);
  assert.ok(await AuditLog.findOne({ action: 'job_source.enable', targetId: 'test-remote' }));
});

test('admin edits regions, employer types and priority; bad values are refused', async () => {
  const res = await call('/admin/job-sources/test-sl-board', {
    method: 'PATCH',
    token: adminToken,
    body: { regions: ['somaliland', 'somalia'], employerTypes: ['company', 'health'], priority: 1 },
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body.data.source.regions, ['somaliland', 'somalia']);
  assert.equal(body.data.source.priority, 1);
  assert.ok(await AuditLog.findOne({ action: 'job_source.update', targetId: 'test-sl-board' }));

  const bad = await call('/admin/job-sources/test-sl-board', {
    method: 'PATCH',
    token: adminToken,
    body: { regions: [], employerTypes: ['bank'], priority: 5000, enabled: 'yes', name: 'x' },
  });
  const badBody = await bad.json();
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(badBody.meta.details).sort(), [
    'employerTypes',
    'enabled',
    'name',
    'priority',
    'regions',
  ]);

  const missing = await call('/admin/job-sources/no-such-source', {
    method: 'PATCH',
    token: adminToken,
    body: { priority: 1 },
  });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, 'JOB_SOURCE_NOT_FOUND');
});

test('admin edits a region city list (trimmed, duplicates removed, audited)', async () => {
  const res = await call('/admin/regions/somaliland', {
    method: 'PATCH',
    token: adminToken,
    body: { cities: [' Hargeisa ', 'hargeisa', 'Gabiley'] },
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body.data.region.cities, ['Hargeisa', 'Gabiley']);
  assert.ok(await AuditLog.findOne({ action: 'region.update', targetId: 'somaliland' }));

  const bad = await call('/admin/regions/kenya', {
    method: 'PATCH',
    token: adminToken,
    body: { cities: ['Nairobi'] },
  });
  assert.equal(bad.status, 400);
  const empty = await call('/admin/regions/somalia', {
    method: 'PATCH',
    token: adminToken,
    body: { cities: [''] },
  });
  assert.equal(empty.status, 400);
});

test("errors come in the admin's saved language (Somali), like every other API error", async () => {
  // A signed-in user's saved language wins over Accept-Language (architecture doc §2).
  const email = 'hodan@sources.invalid';
  await call('/auth/register', {
    method: 'POST',
    body: { email, password: PASSWORD, ageConfirmed: true, preferredLanguage: 'so' },
  });
  await promoteToAdmin(email);
  const login = await (
    await call('/auth/login', { method: 'POST', body: { email, password: PASSWORD } })
  ).json();
  const res = await call('/admin/job-sources/test-unchecked', {
    method: 'PATCH',
    token: login.data.accessToken,
    body: { enabled: true },
  });
  const body = await res.json();
  assert.equal(body.error.code, 'SOURCE_TERMS_NOT_CHECKED');
  assert.equal(body.error.message, 'Ilahan lama shidi karo ilaa shuruudihiisa la hubiyo');
});
