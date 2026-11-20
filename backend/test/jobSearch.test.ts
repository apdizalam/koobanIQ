import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { registerAdapter, unregisterAdapter } from '../src/jobs/sources/registry.js';
import type { NormalizedJob } from '../src/jobs/sources/types.js';
import { saveJobs } from '../src/jobs/store.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Job } from '../src/models/Job.js';
import { JobMatch } from '../src/models/JobMatch.js';
import { JobSource } from '../src/models/JobSource.js';
import { Profile } from '../src/models/Profile.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { ResearchRun } from '../src/models/ResearchRun.js';
import { SavedJob } from '../src/models/SavedJob.js';
import { Skill } from '../src/models/Skill.js';
import { User } from '../src/models/User.js';
import { researchSettings } from '../src/services/researchService.js';
import { promoteToAdmin } from '../src/services/userService.js';
import { RUN_ID } from './support/testRun.js';

// Job search (methods A and B) with relevance (TIQ-17/18). Own database per run;
// fictional people, employers and jobs; fake sources only.
const DB_NAME = `kobaniq_test_jobsearch_${RUN_ID}`;
const PASSWORD = 'correct-horse-17';

let server: Server;
let baseUrl: string;
let amina: string;
let hodan: string;
let aminaId: mongoose.Types.ObjectId;

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

const job = (n: number, over: Partial<NormalizedJob> = {}): NormalizedJob => ({
  sourceKey: 'fake-board',
  externalId: `fake-${n}`,
  title: 'Data Officer',
  employer: `Example Relief Org ${n}`,
  employerType: 'ngo',
  region: 'somaliland',
  city: 'Hargeisa',
  applyUrl: `https://jobs.example.invalid/apply/${n}`,
  description:
    'Requirements:\n- At least two (2) years of relevant work experience.\n- Excel and report writing.\nDesirable:\n- SPSS is an advantage.',
  ...over,
});

const future = new Date(Date.now() + 30 * 24 * 3600 * 1000);
const past = new Date(Date.now() - 2 * 24 * 3600 * 1000);

before(async () => {
  researchSettings.retryBaseMs = 5;
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all(
    [User, RefreshToken, Profile, Skill, Job, JobMatch, SavedJob, JobSource, ResearchRun].map((m) =>
      m.syncIndexes(),
    ),
  );
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  amina = await account('amina@jobsearch.invalid');
  hodan = await account('hodan@jobsearch.invalid');
  aminaId = (await User.findOne({ email: 'amina@jobsearch.invalid' }))!._id;
  // A junior data clerk (two years), fictional.
  await Profile.create({
    userId: aminaId,
    personal: { headline: 'Data clerk' },
    experience: [
      {
        title: 'Data clerk',
        employer: 'Example Clinic',
        startDate: '2024-11',
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
    { userId: aminaId, name: 'Report writing', key: 'report writing', selfLevel: 'mid' },
  ]);

  // Stored jobs, as earlier research would have left them.
  await saveJobs([
    job(1, { deadline: future }),
    job(2, {
      title: 'Senior Programme Manager',
      description: 'Requirements: minimum 8 years of experience; Excel and report writing.',
    }),
    job(3, {
      title: 'Data Analyst',
      description: 'Requirements: SQL, Python and Power BI are required.',
    }),
    job(4, { title: 'Data Officer (expired)', deadline: past }),
    job(5, {
      title: 'Data Officer',
      region: 'somalia',
      city: 'Mogadishu',
      employer: 'Example Health',
    }),
    job(6, {
      title: 'Remote Data Assistant',
      region: 'remote',
      city: undefined,
      employerType: 'company',
    }),
  ]);
});

after(async () => {
  unregisterAdapter('fake-board');
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

const titles = (items: Json[]) => items.map((i) => i.job.title);

test('End Test (method A): stored jobs are scored; fitting ones are the main results', async () => {
  const res = await call(amina, 'GET', '/jobs/search');
  assert.equal(res.status, 200);
  const d = res.body.data;
  assert.deepEqual(d.regions, ['somaliland'], 'the user’s preferred region by default');
  assert.ok(titles(d.recommended).includes('Data Officer'));
  // Never pushed: the senior job and the one missing three essential skills.
  assert.equal(titles(d.recommended).includes('Senior Programme Manager'), false);
  assert.equal(titles(d.recommended).includes('Data Analyst'), false);
  assert.equal(d.counts.lowerMatch, 2);
  assert.deepEqual(d.lowerMatch, [], 'lower matches only when asked for');
  // Expired and other-region jobs are not searched; remote is.
  assert.equal(titles(d.recommended).includes('Data Officer (expired)'), false);
  assert.ok(d.recommended.every((i: Json) => ['somaliland', 'remote'].includes(i.job.region)));

  const first = d.recommended[0];
  assert.equal(first.job.applyUrl.startsWith('https://jobs.example.invalid/apply/'), true);
  assert.equal(first.job.sourceKey, 'fake-board');
  assert.equal(typeof first.match.score, 'number');
  assert.ok(first.match.reasons.length > 0);
  // Best first.
  const scores = d.recommended.map((i: Json) => i.match.score);
  assert.deepEqual(
    scores,
    [...scores].sort((a: number, b: number) => b - a),
  );
});

test('lower matches on request, each with the reason it is lower', async () => {
  const d = (await call(amina, 'GET', '/jobs/search?lower=1')).body.data;
  const senior = d.lowerMatch.find((i: Json) => i.job.title === 'Senior Programme Manager');
  assert.equal(senior.match.levelFit, 'above');
  assert.ok(senior.match.reasons.some((r: Json) => r.key === 'notRecommendedLevel'));
  const analyst = d.lowerMatch.find((i: Json) => i.job.title === 'Data Analyst');
  assert.deepEqual([...analyst.match.missingRequired].sort(), ['power bi', 'python', 'sql']);
});

test('filters: keywords, region, city, employer type; nothing found = empty, never invented', async () => {
  const all = (await call(amina, 'GET', '/jobs/search?regions=somalia&lower=1')).body.data;
  assert.ok(
    [...all.recommended, ...all.lowerMatch].every((i: Json) =>
      ['somalia', 'remote'].includes(i.job.region),
    ),
  );
  assert.ok([...all.recommended, ...all.lowerMatch].some((i: Json) => i.job.city === 'Mogadishu'));

  const city = (await call(amina, 'GET', '/jobs/search?city=hargeisa&lower=1')).body.data;
  assert.ok(
    [...city.recommended, ...city.lowerMatch].every((i: Json) => i.job.city === 'Hargeisa'),
  );

  const companies = (await call(amina, 'GET', '/jobs/search?employerTypes=company&lower=1')).body
    .data;
  assert.deepEqual(titles([...companies.recommended, ...companies.lowerMatch]), [
    'Remote Data Assistant',
  ]);

  const none = (await call(amina, 'GET', '/jobs/search?q=astronaut')).body.data;
  assert.equal(none.searched, 0);
  assert.deepEqual(none.recommended, []);
  assert.deepEqual(none.counts, { recommended: 0, lowerMatch: 0 });

  const bad = await call(amina, 'GET', '/jobs/search?regions=kenya&employerTypes=bank');
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.meta.details).sort(), ['employerTypes', 'regions']);
});

test('End Test (TIQ-17): every stored match has all its explanation fields', async () => {
  const matches = await JobMatch.find({ userId: aminaId }).lean();
  assert.ok(matches.length >= 4);
  for (const m of matches) {
    for (const field of [
      'category',
      'matchedSkills',
      'missingRequired',
      'missingPreferred',
      'reasons',
      'levelFit',
      'userLevel',
    ]) {
      assert.notEqual((m as Json)[field], undefined, field);
    }
    assert.ok(m.reasons.length > 0);
  }
});

test('End Test (method B): a public research run is scored the same way', async () => {
  registerAdapter({
    key: 'fake-board',
    search: async () => [
      job(11, { title: 'Data Officer', employer: 'Example Water Org', deadline: future }),
      job(12, { title: 'Head of Finance', description: 'Minimum 12 years of experience.' }),
    ],
  });
  await JobSource.create({
    key: 'fake-board',
    name: 'Fake board',
    type: 'job_board',
    connection: 'api',
    regions: ['somaliland'],
    employerTypes: ['ngo'],
    enabled: true,
    termsCheckedAt: new Date(),
  });
  const started = await call(amina, 'POST', '/research/run', {
    sourceKeys: ['fake-board'],
    regions: ['somaliland'],
  });
  assert.equal(started.status, 202);
  let run: Json;
  for (let i = 0; i < 200; i += 1) {
    run = (await call(amina, 'GET', `/research/runs/${started.body.data.run.id}`)).body.data;
    if (run.run.status !== 'running') break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(run!.run.status, 'completed');
  assert.deepEqual(titles(run!.recommended), ['Data Officer']);
  assert.deepEqual(titles(run!.lowerMatch), ['Head of Finance']);
  assert.equal(run!.lowerMatch[0].match.levelFit, 'above');
});

test('saved jobs: save, list with match, job detail says saved, unsave; private per user', async () => {
  const { recommended } = (await call(amina, 'GET', '/jobs/search')).body.data;
  const id = recommended[0].job.id;
  assert.equal((await call(amina, 'PUT', `/jobs/${id}/save`)).status, 204);
  assert.equal((await call(amina, 'PUT', `/jobs/${id}/save`)).status, 204, 'saving twice is fine');
  const saved = (await call(amina, 'GET', '/jobs/saved')).body.data.jobs;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].job.id, id);
  assert.equal(typeof saved[0].match.score, 'number');
  const detail = (await call(amina, 'GET', `/jobs/${id}`)).body.data;
  assert.equal(detail.saved, true);
  assert.equal(detail.job.applyUrl, recommended[0].job.applyUrl);

  // Another user: nothing of Amina's.
  assert.deepEqual((await call(hodan, 'GET', '/jobs/saved')).body.data.jobs, []);
  assert.equal((await call(hodan, 'GET', `/jobs/${id}`)).body.data.saved, false);

  assert.equal((await call(amina, 'DELETE', `/jobs/${id}/save`)).status, 204);
  assert.deepEqual((await call(amina, 'GET', '/jobs/saved')).body.data.jobs, []);
  assert.equal((await call(amina, 'PUT', '/jobs/not-an-id/save')).status, 404);
});

test('deleting an account deletes its matches and saved jobs; jobs stay', async () => {
  const email = 'gone@jobsearch.invalid';
  const token = await account(email);
  const goneId = (await User.findOne({ email }))!._id;
  const { recommended, lowerMatch } = (await call(token, 'GET', '/jobs/search?lower=1')).body.data;
  const anyJob = [...recommended, ...lowerMatch][0].job.id;
  await call(token, 'PUT', `/jobs/${anyJob}/save`);
  assert.ok((await JobMatch.countDocuments({ userId: goneId })) > 0);
  const jobsBefore = await Job.countDocuments();

  await promoteToAdmin('hodan@jobsearch.invalid');
  const admin = await account('hodan@jobsearch.invalid');
  assert.equal((await call(admin, 'DELETE', `/admin/users/${goneId}`)).status, 204);
  assert.equal(await JobMatch.countDocuments({ userId: goneId }), 0);
  assert.equal(await SavedJob.countDocuments({ userId: goneId }), 0);
  assert.equal(await Job.countDocuments(), jobsBefore);
});
