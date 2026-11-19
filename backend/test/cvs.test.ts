import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { setAiProviderForTests } from '../src/ai/aiService.js';
import { createMockProvider } from '../src/ai/mock.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Cv } from '../src/models/Cv.js';
import { JobDescription } from '../src/models/JobDescription.js';
import { Profile } from '../src/models/Profile.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { Setting } from '../src/models/Setting.js';
import { Skill } from '../src/models/Skill.js';
import { UsageRecord } from '../src/models/UsageRecord.js';
import { User } from '../src/models/User.js';
import { RUN_ID } from './support/testRun.js';
import { HEALTH_JOB, HEALTH_PROFILE, type SampleProfile } from './support/sampleProfiles.js';

// Mock AI only (no network, no quota). Own database per run. Synthetic profiles only.
const DB_NAME = `kobaniq_test_cv_${RUN_ID}`;
const PASSWORD = 'correct-horse-9c';

let server: Server;
let baseUrl: string;
let mock: ReturnType<typeof createMockProvider>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads any answer
type Json = any;

async function call(token: string | null, method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json };
}

/**
 * A signed-in account. Test accounts (fictional data) are marked with the
 * server-side flag, as an admin would in the Admin Dashboard.
 */
async function account(email: string, preferredLanguage = 'en', testAccount = true) {
  await call(null, 'POST', '/auth/register', {
    email,
    password: PASSWORD,
    ageConfirmed: true,
    preferredLanguage,
  });
  if (testAccount) await User.updateOne({ email }, { testAccount: true });
  return (await call(null, 'POST', '/auth/login', { email, password: PASSWORD })).body.data
    .accessToken as string;
}

/** Fills a profile and skills through the real API; returns the profile with ids. */
async function fillProfile(token: string, sample: SampleProfile) {
  await call(token, 'PATCH', '/profile/personal', sample.personal);
  for (const section of [
    'experience',
    'education',
    'projects',
    'certifications',
    'languages',
  ] as const) {
    for (const item of sample[section]) await call(token, 'POST', `/profile/${section}`, item);
  }
  for (const skill of sample.skills) await call(token, 'POST', '/skills', skill);
  return (await call(token, 'GET', '/profile')).body.data.profile as Json;
}

/** A saved job description with these facts (TIQ-8 extraction mocked). */
async function saveJob(token: string, facts: Record<string, unknown>, text: string) {
  mock.reply({ json: { isJobDescription: true, ...facts } });
  const res = await call(token, 'POST', '/job-descriptions', { text });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.jobDescription.id as string;
}

/** A good CV answer for HEALTH_PROFILE: picks entries by id, words only from the profile. */
function goodAnswer(profile: Json, over: Record<string, unknown> = {}) {
  return {
    headline: 'Community Health Worker',
    summary:
      'Community health worker with field experience in vaccination campaigns and report writing.',
    skills: ['Report writing', 'Microsoft Excel'],
    experience: [
      {
        id: profile.experience[0].id,
        bullets: ['Visited 40 households a week.', 'Trained 6 new volunteers.'],
      },
    ],
    education: [{ id: profile.education[0].id }],
    projects: [{ id: profile.projects[0].id, bullets: ['Built an Excel vaccination tracker.'] }],
    certifications: [{ id: profile.certifications[0].id }],
    languages: profile.languages.map((l: { id: string }) => ({ id: l.id })),
    ...over,
  };
}

const JOB_TEXT = `Public Health Officer - Example Health Partnership (synthetic). Hargeisa. Requirements: report writing, Microsoft Excel, SQL. Desirable: DHIS2. Coordinate community health workers and write monthly reports.`;

let amina: string;
let aminaProfile: Json;
let jobId: string;

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all(
    [User, RefreshToken, Profile, Skill, JobDescription, Cv, UsageRecord].map((m) =>
      m.syncIndexes(),
    ),
  );
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  mock = createMockProvider();
  setAiProviderForTests(mock.provider);
  amina = await account('amina@cv.invalid', 'so');
  aminaProfile = await fillProfile(amina, HEALTH_PROFILE);
  jobId = await saveJob(amina, HEALTH_JOB, JOB_TEXT);
});

beforeEach(async () => {
  mock = createMockProvider();
  setAiProviderForTests(mock.provider);
  // Default: no stored setting = BLOCKED.
  await Setting.deleteMany({});
});
afterEach(() => setAiProviderForTests(undefined));

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('End Test: English CV built only from profile facts; missing items listed', async () => {
  mock.reply({ json: goodAnswer(aminaProfile) });
  const res = await call(amina, 'POST', '/cvs/generate', {
    jobDescriptionId: jobId,
    language: 'en',
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const cv = res.body.data.cv;
  assert.equal(cv.language, 'en');
  assert.equal(cv.version, 1);
  assert.equal(cv.status, 'draft');

  // Facts copied from the profile by code (diff test).
  const c = cv.content;
  assert.equal(c.header.fullName, 'Ayaan Testcase');
  assert.equal(
    c.header.email,
    'ayaan.testcase@example.com',
    'the CV contact email, not the login email',
  );
  assert.equal(c.header.phone, '+252 63 000 0001');
  assert.deepEqual(
    {
      title: c.experience[0].title,
      employer: c.experience[0].employer,
      startDate: c.experience[0].startDate,
      endDate: c.experience[0].endDate,
    },
    {
      title: 'Community Health Worker',
      employer: 'Example Water and Health Agency',
      startDate: '2022-03',
      endDate: null,
    },
  );
  assert.equal(c.education[0].school, 'Example Institute of Health Sciences');
  assert.equal(c.certifications[0].issuer, 'Example Red Crescent Training Unit');
  assert.deepEqual(c.skills[0], { name: 'Report writing', level: 'advanced', assessed: false });

  // The job asks for SQL and DHIS2, which the profile does not have.
  assert.deepEqual(
    cv.missingInfo.filter((m: { type: string }) => m.type.endsWith('Skill')),
    [
      { type: 'requiredSkill', item: 'SQL' },
      { type: 'preferredSkill', item: 'DHIS2' },
    ],
  );
});

test('privacy: the AI never receives name, email, phone, city, employer, school, issuer or links', async () => {
  mock.reply({ json: goodAnswer(aminaProfile) });
  await call(amina, 'POST', '/cvs/generate', { jobDescriptionId: jobId, language: 'en' });
  const sent = mock.requests[0].system + mock.requests[0].prompt;
  for (const secret of [
    'Ayaan Testcase',
    'amina@cv.invalid',
    'ayaan.testcase@example.com',
    '+252 63 000 0001',
    'Example Water and Health Agency',
    'Example Institute of Health Sciences',
    'Example Red Crescent Training Unit',
  ]) {
    assert.equal(sent.includes(secret), false, `not sent: ${secret}`);
  }
  assert.match(mock.requests[0].prompt, /<candidate_profile>[\s\S]*Visited 40 households/);
  assert.match(mock.requests[0].system, /English/);
});

test('End Test: the CV language is required every time, never taken from the app language', async () => {
  // Amina's app language is Somali; leaving out the CV language is refused.
  const res = await call(amina, 'POST', '/cvs/generate', { jobDescriptionId: jobId });
  assert.equal(res.status, 400);
  assert.equal(res.body.meta.details.language, 'Dooro luqadda CV-ga: Ingiriisi ama Soomaali');
  assert.equal(mock.requests.length, 0);
});

test('End Test: Somali CV, and regenerating in the other language makes new versions', async () => {
  const before = await Cv.countDocuments({ jobDescriptionId: jobId });
  mock.reply(
    {
      json: goodAnswer(aminaProfile, {
        summary: 'Shaqaale caafimaadka bulshada oo khibrad u leh ololaha tallaalka.',
      }),
    },
    { json: goodAnswer(aminaProfile) },
  );
  const so = await call(amina, 'POST', '/cvs/generate', {
    jobDescriptionId: jobId,
    language: 'so',
  });
  assert.equal(so.status, 201);
  assert.equal(so.body.data.cv.language, 'so');
  assert.match(mock.requests[0].system, /Somali/);

  const enAgain = await call(amina, 'POST', '/cvs/generate', {
    jobDescriptionId: jobId,
    language: 'en',
  });
  assert.equal(enAgain.body.data.cv.language, 'en');
  const versions = (await Cv.find({ jobDescriptionId: jobId }).sort({ createdAt: 1 }).lean()).map(
    (cv) => `${cv.language}${cv.version}`,
  );
  assert.equal(versions.length, before + 2);
  assert.ok(versions.includes('so1') && versions.includes('en2'), versions.join(','));
});

test('unsupported claims are rejected: retried once, then nothing is saved', async () => {
  const bad = {
    'unknown experience id': goodAnswer(aminaProfile, {
      experience: [
        { id: new mongoose.Types.ObjectId().toString(), bullets: ['Worked at a made-up place.'] },
      ],
    }),
    'skill not in the profile': goodAnswer(aminaProfile, { skills: ['Report writing', 'Python'] }),
    'number not in the profile': goodAnswer(aminaProfile, {
      summary: 'Community health worker with 10 years of experience.',
    }),
    'claims a required job skill the user lacks': goodAnswer(aminaProfile, {
      summary: 'Community health worker skilled in SQL and report writing.',
    }),
    'same entry twice': goodAnswer(aminaProfile, {
      education: [{ id: aminaProfile.education[0].id }, { id: aminaProfile.education[0].id }],
    }),
    'extra field': { ...goodAnswer(aminaProfile), employer: 'Invented Ltd' },
  };
  for (const [label, answer] of Object.entries(bad)) {
    // Bad then good: the retry fixes it.
    mock = createMockProvider();
    setAiProviderForTests(mock.provider);
    mock.reply({ json: answer }, { json: goodAnswer(aminaProfile) });
    const fixed = await call(amina, 'POST', '/cvs/generate', {
      jobDescriptionId: jobId,
      language: 'en',
    });
    assert.equal(fixed.status, 201, `${label}: retried`);
    assert.equal(mock.requests.length, 2, `${label}: one retry`);

    // Bad twice: 502, nothing saved.
    const count = await Cv.countDocuments();
    mock.reply({ json: answer }, { json: answer });
    const failed = await call(amina, 'POST', '/cvs/generate', {
      jobDescriptionId: jobId,
      language: 'en',
    });
    assert.equal(failed.status, 502, `${label}: rejected`);
    assert.equal(failed.body.error.code, 'AI_BAD_OUTPUT');
    assert.equal(await Cv.countDocuments(), count, `${label}: nothing saved`);
  }
});

test('invalid AI JSON: retried once, then a clean error', async () => {
  mock.reply({ text: 'Here is the CV: {' }, { text: 'still not JSON' });
  const res = await call(amina, 'POST', '/cvs/generate', {
    jobDescriptionId: jobId,
    language: 'en',
  });
  assert.equal(res.status, 502);
  assert.equal(mock.requests.length, 2);
});

test('privacy guard: real accounts are blocked unless the stored setting is ALLOWED', async () => {
  // Not a test account (no flag), even though the email looks like a test address.
  const real = await account('hodan@example.com', 'en', false);
  await fillProfile(real, HEALTH_PROFILE);
  mock.reply({ json: { isJobDescription: true, ...HEALTH_JOB } });
  const job = await call(real, 'POST', '/job-descriptions', { text: JOB_TEXT });
  const res = await call(real, 'POST', '/cvs/generate', {
    jobDescriptionId: job.body.data.jobDescription.id,
    language: 'en',
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'AI_PERSONAL_DATA_BLOCKED');
  assert.equal(mock.requests.length, 1, 'only the job ad (no personal data) went to the AI');

  // An admin set ALLOWED (paid tier verified): the backend lets it through at once.
  await Setting.create({ key: 'ai_personal_data', value: 'allowed' });
  const profile = (await call(real, 'GET', '/profile')).body.data.profile;
  const body = { jobDescriptionId: job.body.data.jobDescription.id, language: 'en' };
  mock.reply({ json: goodAnswer(profile) });
  assert.equal((await call(real, 'POST', '/cvs/generate', body)).status, 201);

  // Back to BLOCKED: refused again on the very next request.
  await Setting.updateOne({ key: 'ai_personal_data' }, { value: 'blocked' });
  assert.equal((await call(real, 'POST', '/cvs/generate', body)).status, 403);

  // Marked as a test account by an admin: works while BLOCKED.
  await User.updateOne({ email: 'hodan@example.com' }, { testAccount: true });
  mock.reply({ json: goodAnswer(profile) });
  assert.equal((await call(real, 'POST', '/cvs/generate', body)).status, 201);
});

test('CV contact email: required, used automatically, separate from the login email', async () => {
  const token = await account('nimco@cv.invalid');
  const { contactEmail: _omit, ...withoutContact } = HEALTH_PROFILE.personal;
  void _omit;
  const profile = await fillProfile(token, { ...HEALTH_PROFILE, personal: withoutContact });
  const job = await saveJob(token, HEALTH_JOB, `${JOB_TEXT} Contact-email case.`);
  const body = { jobDescriptionId: job, language: 'en' };

  // None yet: the user is asked to add one, before anything goes to the AI.
  const missing = await call(token, 'POST', '/cvs/generate', body);
  assert.equal(missing.status, 422);
  assert.equal(missing.body.error.code, 'CV_CONTACT_EMAIL_REQUIRED');
  assert.equal(mock.requests.length, 1, 'only the job ad extraction');

  // Saved once in the profile, then used for every CV without asking again.
  const bad = await call(token, 'PATCH', '/profile/personal', { contactEmail: 'not-an-email' });
  assert.equal(bad.status, 400);
  await call(token, 'PATCH', '/profile/personal', { contactEmail: ' Nimco.CV@Example.com ' });
  mock.reply({ json: goodAnswer(profile) }, { json: goodAnswer(profile) });
  const first = await call(token, 'POST', '/cvs/generate', body);
  const second = await call(token, 'POST', '/cvs/generate', body);
  assert.equal(first.body.data.cv.content.header.email, 'nimco.cv@example.com');
  assert.equal(second.body.data.cv.content.header.email, 'nimco.cv@example.com');

  // Changing it never changes the login email.
  const me = await call(token, 'GET', '/me');
  assert.equal(me.body.data.user.email, 'nimco@cv.invalid');
  assert.equal(
    (await call(null, 'POST', '/auth/login', { email: 'nimco@cv.invalid', password: PASSWORD }))
      .status,
    200,
  );
});

test('an empty profile is refused before any AI request', async () => {
  const empty = await account('empty@cv.invalid');
  await call(empty, 'PATCH', '/profile/personal', { contactEmail: 'empty.cv@example.com' });
  const job = await saveJob(empty, HEALTH_JOB, `${JOB_TEXT} Empty-profile case.`);
  const res = await call(empty, 'POST', '/cvs/generate', { jobDescriptionId: job, language: 'en' });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'PROFILE_INCOMPLETE');
  assert.equal(mock.requests.length, 1, 'only the job ad extraction');
});

test("user isolation: another user's job description and CVs are not found", async () => {
  mock.reply({ json: goodAnswer(aminaProfile) });
  const mine = await call(amina, 'POST', '/cvs/generate', {
    jobDescriptionId: jobId,
    language: 'en',
  });
  const cvId = mine.body.data.cv.id;

  const omar = await account('omar@cv.invalid');
  await fillProfile(omar, HEALTH_PROFILE);
  const useHers = await call(omar, 'POST', '/cvs/generate', {
    jobDescriptionId: jobId,
    language: 'en',
  });
  assert.equal(useHers.status, 404);
  assert.equal(useHers.body.error.code, 'JOB_DESCRIPTION_NOT_FOUND');
  assert.equal((await call(omar, 'GET', `/cvs/${cvId}`)).status, 404);
  assert.equal((await call(omar, 'DELETE', `/cvs/${cvId}`)).status, 404);
  assert.equal((await call(omar, 'GET', '/cvs')).body.data.cvs.length, 0);
  assert.equal((await call(null, 'GET', '/cvs')).status, 401);

  const list = await call(amina, 'GET', '/cvs');
  assert.ok(list.body.data.cvs.some((c: { id: string }) => c.id === cvId));
  assert.equal('content' in list.body.data.cvs[0], false, 'list without content');
  assert.equal(
    (await call(amina, 'GET', `/cvs/${cvId}`)).body.data.cv.content.header.fullName,
    'Ayaan Testcase',
  );
  assert.equal((await call(amina, 'DELETE', `/cvs/${cvId}`)).status, 204);
  assert.equal((await call(amina, 'GET', `/cvs/${cvId}`)).status, 404);
});

test('usage is recorded for CV generation without any CV content', async () => {
  mock.reply({ json: goodAnswer(aminaProfile) });
  await call(amina, 'POST', '/cvs/generate', { jobDescriptionId: jobId, language: 'en' });
  const record = await UsageRecord.findOne({ feature: 'cv_generation', status: 'ok' }).lean();
  assert.ok(record);
  const stored = JSON.stringify(record);
  for (const word of ['Ayaan', 'households', 'Community health worker']) {
    assert.equal(stored.includes(word), false);
  }
});
