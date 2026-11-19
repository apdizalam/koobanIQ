import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { setAiProviderForTests } from '../src/ai/aiService.js';
import { createMockProvider } from '../src/ai/mock.js';
import { AiProviderError } from '../src/ai/provider.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { JobDescription } from '../src/models/JobDescription.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { UsageRecord } from '../src/models/UsageRecord.js';
import { User } from '../src/models/User.js';
import { keepSkillsFoundIn } from '../src/services/jobDescriptionService.js';
import { RUN_ID } from './support/testRun.js';
import { makePdf } from './support/pdf.js';
import { NOT_A_JOB_DESCRIPTION, SAMPLE_JOB_DESCRIPTIONS } from './support/sampleJobDescriptions.js';

// Mock AI only (no network, no quota). Own database per run. Synthetic job ads only.
const DB_NAME = `kobaniq_test_jd_${RUN_ID}`;
const PASSWORD = 'correct-horse-8a';
const [HEALTH, DEVELOPER] = SAMPLE_JOB_DESCRIPTIONS;
const LOGISTICS_PDF = SAMPLE_JOB_DESCRIPTIONS.find((s) => s.id === 'en-logistics-pdf')!;

let server: Server;
let baseUrl: string;
let amina: string;
let omar: string;
let mock: ReturnType<typeof createMockProvider>;

/** A valid extraction answer, as the AI would send it. */
const extraction = (over: Record<string, unknown> = {}) => ({
  isJobDescription: true,
  language: 'en',
  title: 'Public Health Officer',
  company: 'Example Health Partnership',
  location: 'Hargeisa, Somaliland',
  jobType: 'full_time',
  requiredSkills: ['Report writing', 'Microsoft Excel'],
  preferredSkills: ['DHIS2'],
  education: ["Bachelor's degree in Public Health"],
  experience: ['3 years of experience in community health'],
  responsibilities: ['Coordinate community health workers'],
  qualifications: [],
  deadline: '2026-12-15',
  keywords: ['public health', 'Hargeisa'],
  ...over,
});

async function call(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
  language = 'en',
) {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': language,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads any answer
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as any };
}

async function account(email: string) {
  await call(null, 'POST', '/auth/register', { email, password: PASSWORD });
  return (await call(null, 'POST', '/auth/login', { email, password: PASSWORD })).body.data
    .accessToken as string;
}

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.syncIndexes(),
    RefreshToken.syncIndexes(),
    JobDescription.syncIndexes(),
    UsageRecord.syncIndexes(),
  ]);
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  amina = await account('amina@jd.invalid');
  omar = await account('omar@jd.invalid');
});

beforeEach(() => {
  mock = createMockProvider();
  setAiProviderForTests(mock.provider);
});
afterEach(() => setAiProviderForTests(undefined));

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('pasted text: extracted, checked and saved; the ad is sent as data with strict JSON rules', async () => {
  mock.reply({
    json: extraction({ requiredSkills: ['Report writing', 'Microsoft Excel', 'Python'] }),
  });
  const res = await call(amina, 'POST', '/job-descriptions', { text: HEALTH.text });
  assert.equal(res.status, 201);
  const jd = res.body.data.jobDescription;
  assert.equal(jd.source, 'text');
  assert.equal(jd.extracted.title, 'Public Health Officer');
  assert.equal(jd.extracted.deadline, '2026-12-15');
  assert.equal(jd.text, HEALTH.text);

  // "Python" is not in the ad: removed (never invent).
  assert.deepEqual(jd.extracted.requiredSkills, ['Report writing', 'Microsoft Excel']);
  assert.equal((await JobDescription.findById(jd.id))?.droppedSkills, 1);

  const request = mock.requests[0];
  assert.match(
    request.prompt,
    /<job_description>[\s\S]*Public Health Officer[\s\S]*<\/job_description>/,
  );
  assert.match(request.system, /Never invent/);
  assert.match(request.system, /Do not translate/);
  assert.equal(request.jsonSchema.additionalProperties, false);
  assert.equal(request.temperature, 0);
  assert.equal(await UsageRecord.countDocuments({ feature: 'jd_extraction', status: 'ok' }), 1);
});

test('the same ad again (other spacing / letter case) reuses the saved result: no AI request', async () => {
  mock.reply({
    json: extraction({ title: 'Junior Software Developer', company: 'Sample Tech Hub' }),
  });
  const first = await call(amina, 'POST', '/job-descriptions', { text: DEVELOPER.text });
  assert.equal(first.status, 201);
  const again = await call(amina, 'POST', '/job-descriptions', {
    text: `  ${DEVELOPER.text.toUpperCase().replace(/ /g, '   ')}  `,
  });
  assert.equal(again.status, 200);
  assert.equal(again.body.meta.reused, true);
  assert.equal(again.body.data.jobDescription.id, first.body.data.jobDescription.id);
  assert.equal(mock.requests.length, 1, 'one AI request only');
});

test('PDF upload: the file goes to the AI as a document; only its name is stored', async () => {
  const pdf = makePdf(LOGISTICS_PDF.text.split('\n'));
  mock.reply({ json: extraction({ title: 'Logistics Officer', deadline: '2026-11-30' }) });
  const res = await call(amina, 'POST', '/job-descriptions', {
    pdf: { fileName: 'logistics-officer.pdf', data: pdf.toString('base64') },
  });
  assert.equal(res.status, 201);
  const jd = res.body.data.jobDescription;
  assert.equal(jd.source, 'pdf');
  assert.equal(jd.fileName, 'logistics-officer.pdf');
  assert.equal(jd.text, null, 'PDF content is not stored');
  assert.equal(mock.requests[0].documents?.[0].mimeType, 'application/pdf');
  assert.equal(mock.requests[0].documents?.[0].data, pdf.toString('base64'));
  assert.match(mock.requests[0].prompt, /attached PDF/);
});

test('End Test: a bad AI answer is retried once; twice bad fails gracefully and nothing is saved', async () => {
  mock.reply({ text: 'Here you go: {"title":' }, { json: extraction({ title: 'Retried Title' }) });
  const retried = await call(amina, 'POST', '/job-descriptions', {
    text: `${HEALTH.text}\nRetry case.`,
  });
  assert.equal(retried.status, 201);
  assert.equal(retried.body.data.jobDescription.extracted.title, 'Retried Title');

  const before = await JobDescription.countDocuments();
  mock.reply({ json: { ...extraction(), salary: 'invented' } }, { text: 'not json' });
  const failed = await call(amina, 'POST', '/job-descriptions', {
    text: `${HEALTH.text}\nFailure case.`,
  });
  assert.equal(failed.status, 502);
  assert.equal(failed.body.error.code, 'AI_BAD_OUTPUT');
  assert.equal(await JobDescription.countDocuments(), before, 'nothing saved');
  assert.equal(mock.requests.length, 4, 'exactly one retry per request');
});

test('not a job description → 422 with a clear message; nothing saved', async () => {
  mock.reply({
    json: extraction({
      isJobDescription: false,
      title: null,
      company: null,
      location: null,
      jobType: null,
      requiredSkills: [],
      preferredSkills: [],
      deadline: null,
    }),
  });
  const res = await call(amina, 'POST', '/job-descriptions', { text: NOT_A_JOB_DESCRIPTION });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'NOT_A_JOB_DESCRIPTION');
  assert.equal(await JobDescription.countDocuments({ rawText: NOT_A_JOB_DESCRIPTION }), 0);
});

test('input checks: one of text or PDF, text length, real PDF, size limits', async () => {
  const tooMany = await call(amina, 'POST', '/job-descriptions', { text: HEALTH.text, pdf: {} });
  assert.equal(tooMany.status, 400);
  assert.deepEqual(Object.keys(tooMany.body.meta.details), ['body']);
  assert.equal((await call(amina, 'POST', '/job-descriptions', {})).status, 400);

  const short = await call(amina, 'POST', '/job-descriptions', { text: 'Too short' });
  assert.equal(
    short.body.meta.details.text,
    'The job description must be between 50 and 20,000 characters',
  );

  const notPdf = await call(amina, 'POST', '/job-descriptions', {
    pdf: { data: Buffer.from('hello, I am not a PDF').toString('base64') },
  });
  assert.equal(notPdf.body.meta.details.pdf, 'This is not a valid PDF file');
  const notBase64 = await call(amina, 'POST', '/job-descriptions', { pdf: { data: '%%%' } });
  assert.equal(notBase64.body.meta.details.pdf, 'This is not a valid PDF file');

  const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 + 10, 32)]);
  const tooLarge = await call(amina, 'POST', '/job-descriptions', {
    pdf: { data: big.toString('base64') },
  });
  assert.equal(tooLarge.body.meta.details.pdf, 'The PDF can be at most 5 MB');

  const huge = await call(
    amina,
    'POST',
    '/job-descriptions',
    JSON.stringify({ text: 'x'.repeat(9 * 1024 * 1024) }),
  );
  assert.equal(huge.status, 413);
  assert.equal(huge.body.error.code, 'PAYLOAD_TOO_LARGE');

  // Other routes keep the normal small limit.
  const profile = await call(
    amina,
    'PATCH',
    '/profile/personal',
    JSON.stringify({ summary: 'x'.repeat(200_000) }),
  );
  assert.equal(profile.status, 413);
  assert.equal(mock.requests.length, 0, 'no AI request for bad input');
});

test('AI problems come back in the user’s saved language (free quota reached, Somali)', async () => {
  // A signed-in user's saved language wins over Accept-Language (architecture doc §2).
  await call(null, 'POST', '/auth/register', {
    email: 'hodan@jd.invalid',
    password: PASSWORD,
    preferredLanguage: 'so',
  });
  const hodan = (
    await call(null, 'POST', '/auth/login', { email: 'hodan@jd.invalid', password: PASSWORD })
  ).body.data.accessToken as string;
  mock.reply({ error: new AiProviderError('quota', 'quota', 429) });
  const res = await call(
    hodan,
    'POST',
    '/job-descriptions',
    { text: `${HEALTH.text}\nQuota.` },
    'en',
  );
  assert.equal(res.status, 503);
  assert.deepEqual(res.body.error, {
    code: 'AI_QUOTA_REACHED',
    message: 'Xadka bilaashka ah ee AI waa la gaaray hadda. Fadlan isku day mar dambe',
  });
});

test('list, get and delete own job descriptions; another user gets 404; signed-out 401', async () => {
  mock.reply({ json: extraction({ title: 'Owned ad' }) });
  const created = await call(amina, 'POST', '/job-descriptions', {
    text: `${HEALTH.text}\nOwned.`,
  });
  const id = created.body.data.jobDescription.id;

  const list = await call(amina, 'GET', '/job-descriptions');
  assert.ok(list.body.data.jobDescriptions.some((j: { id: string }) => j.id === id));
  assert.equal('text' in list.body.data.jobDescriptions[0], false, 'list without the full text');
  assert.equal(
    (await call(amina, 'GET', `/job-descriptions/${id}`)).body.data.jobDescription.id,
    id,
  );

  assert.equal((await call(omar, 'GET', `/job-descriptions/${id}`)).status, 404);
  assert.equal((await call(omar, 'DELETE', `/job-descriptions/${id}`)).status, 404);
  assert.equal((await call(omar, 'GET', '/job-descriptions')).body.data.jobDescriptions.length, 0);
  assert.equal((await call(null, 'GET', '/job-descriptions')).status, 401);

  assert.equal((await call(amina, 'DELETE', `/job-descriptions/${id}`)).status, 204);
  assert.equal((await call(amina, 'GET', `/job-descriptions/${id}`)).status, 404);
});

test('skills check keeps what the text says (English and Somali) and drops the rest', () => {
  const text =
    'Requirements: MS Excel, report writing and Somali. Waxaa la doorbidayaa aqoonta kombiyuutarka.';
  assert.deepEqual(
    keepSkillsFoundIn(text, [
      'Microsoft Excel',
      'Report writing',
      'Python',
      'Kombiyuutar',
      'Quantum Physics',
    ]).kept,
    ['Microsoft Excel', 'Report writing', 'Kombiyuutar'],
  );
});
