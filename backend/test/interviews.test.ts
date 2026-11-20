import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { setAiProviderForTests } from '../src/ai/aiService.js';
import { createMockProvider } from '../src/ai/mock.js';
import { interviewFeedbackSchema, interviewQuestionsSchema } from '../src/ai/schemas/interview.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Interview } from '../src/models/Interview.js';
import { Job } from '../src/models/Job.js';
import { JobDescription } from '../src/models/JobDescription.js';
import { Profile } from '../src/models/Profile.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { UsageRecord } from '../src/models/UsageRecord.js';
import { User } from '../src/models/User.js';
import { RUN_ID } from './support/testRun.js';

// TIQ-19: text interview practice. Own database per run, fictional accounts, mock AI.
const DB_NAME = `kobaniq_test_interview_${RUN_ID}`;
const PASSWORD = 'correct-horse-19i';

let server: Server;
let baseUrl: string;
let mock: ReturnType<typeof createMockProvider>;
let amina: string;
let other: string;
let aminaId: mongoose.Types.ObjectId;

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

async function account(email: string) {
  await call(null, 'POST', '/auth/register', { email, password: PASSWORD, ageConfirmed: true });
  return (await call(null, 'POST', '/auth/login', { email, password: PASSWORD })).body.data
    .accessToken as string;
}

const questions = (n: number) => ({
  questions: Array.from({ length: n }, (_, i) => ({
    question: `Practice question ${i + 1}?`,
    focus: `Focus ${i + 1}`,
  })),
});
const feedback = (score: number) => ({
  score,
  summary: `Summary ${score}.`,
  strengths: ['Clear structure'],
  improvements: ['Give a concrete example'],
  betterAnswer: 'Start with [your example], then explain the result.',
});

async function start(token: string, body: Record<string, unknown>, n = 5) {
  mock.reply({ json: questions(n) });
  return call(token, 'POST', '/interviews', { language: 'en', ...body });
}

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all(
    [User, RefreshToken, Profile, Interview, Job, JobDescription, UsageRecord].map((m) =>
      m.syncIndexes(),
    ),
  );
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Normal accounts (owner decision: practice is open to everyone, not only test accounts).
  amina = await account('amina@interview.invalid');
  other = await account('hodan@interview.invalid');
  aminaId = (await User.findOne({ email: 'amina@interview.invalid' }))!._id;
});

beforeEach(async () => {
  mock = createMockProvider();
  setAiProviderForTests(mock.provider);
  await UsageRecord.deleteMany({});
});
afterEach(() => setAiProviderForTests(undefined));

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('schemas: exact question count, no repeats; feedback score 0–10', () => {
  assert.equal(interviewQuestionsSchema(5).safeParse(questions(5)).success, true);
  assert.equal(interviewQuestionsSchema(5).safeParse(questions(4)).success, false);
  const twice = { questions: [questions(1).questions[0], questions(1).questions[0]] };
  assert.equal(interviewQuestionsSchema(2).safeParse(twice).success, false);
  assert.equal(interviewFeedbackSchema.safeParse(feedback(7)).success, true);
  assert.equal(interviewFeedbackSchema.safeParse(feedback(11)).success, false);
});

test('End Test: a text session of 5 questions completes with feedback per answer; transcript saved', async () => {
  const started = await start(amina, { type: 'behavioral', role: 'Data officer' });
  assert.equal(started.status, 201);
  let interview = started.body.data.interview;
  assert.equal(interview.length, 5);
  assert.equal(interview.question.number, 1);
  assert.equal(interview.question.total, 5);

  // Only the job title (and type) went to the AI, nothing from the account.
  const sent = JSON.stringify(mock.requests[0]);
  assert.match(sent, /Data officer/);
  assert.equal(sent.includes('amina'), false);

  const scores = [4, 6, 8, 7, 5];
  for (const score of scores) {
    mock.reply({ json: feedback(score) });
    const res = await call(amina, 'POST', `/interviews/${interview.id}/answers`, {
      questionId: interview.question.id,
      answer: `My answer with an example, score ${score}.`,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.feedback.score, score);
    assert.ok(mock.requests.at(-1)!.prompt.includes(`score ${score}`), 'answer sent for feedback');
    interview = res.body.data.interview;
  }
  assert.equal(interview.status, 'finished');
  assert.equal(interview.question, null);
  assert.equal(interview.summary.averageScore, 6);
  assert.equal(interview.summary.best, 'q3');
  assert.equal(interview.summary.weakest, 'q1');
  assert.equal(interview.transcript.length, 5);
  assert.equal(interview.transcript[0].answer, 'My answer with an example, score 4.');
  assert.equal(interview.transcript[0].feedback.betterAnswer.length > 0, true);

  // Saved: reading it again gives the same transcript; it is in the history (without transcript).
  const again = await call(amina, 'GET', `/interviews/${interview.id}`);
  assert.equal(again.body.data.interview.transcript.length, 5);
  const history = await call(amina, 'GET', '/interviews');
  assert.equal(history.body.data.interviews[0].id, interview.id);
  assert.equal(history.body.data.interviews[0].transcript, undefined);
  assert.equal(await UsageRecord.countDocuments({ feature: 'interview' }), 6);
});

test('answers: only the current question, never empty, never after the end', async () => {
  const { body } = await start(amina, { type: 'general', role: 'Cashier', length: 3 }, 3);
  const id = body.data.interview.id;
  const empty = await call(amina, 'POST', `/interviews/${id}/answers`, {
    questionId: 'q1',
    answer: '   ',
  });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.code, 'VALIDATION_ERROR');
  const wrong = await call(amina, 'POST', `/interviews/${id}/answers`, {
    questionId: 'q2',
    answer: 'An answer',
  });
  assert.equal(wrong.status, 409);
  const tooLong = await call(amina, 'POST', `/interviews/${id}/answers`, {
    questionId: 'q1',
    answer: 'x'.repeat(3001),
  });
  assert.equal(tooLong.status, 400);
  assert.equal(mock.pending(), 0, 'no AI call for refused answers');

  const cancelled = await call(amina, 'POST', `/interviews/${id}/cancel`);
  assert.equal(cancelled.body.data.interview.status, 'cancelled');
  const late = await call(amina, 'POST', `/interviews/${id}/answers`, {
    questionId: 'q1',
    answer: 'An answer',
  });
  assert.equal(late.status, 409);
  assert.equal(late.body.error.code, 'INTERVIEW_NOT_IN_PROGRESS');
});

test('start: type, language and role are checked; job-specific needs a job ad or a job', async () => {
  const bad = await call(amina, 'POST', '/interviews', { type: 'stress', language: 'de' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION_ERROR');
  const noRole = await call(amina, 'POST', '/interviews', { type: 'technical', language: 'en' });
  assert.equal(noRole.status, 400);
  const noJob = await call(amina, 'POST', '/interviews', {
    type: 'job_specific',
    role: 'Nurse',
    language: 'en',
  });
  assert.equal(noJob.status, 400);
  const badLength = await call(amina, 'POST', '/interviews', {
    type: 'general',
    role: 'Nurse',
    language: 'en',
    length: 7,
  });
  assert.equal(badLength.status, 400);
  assert.equal(mock.pending(), 0);
});

test('job-specific: from a saved job ad (own ads only) or a stored job; only job facts sent', async () => {
  const jd = await JobDescription.create({
    userId: aminaId,
    source: 'text',
    hash: `hash-${RUN_ID}`,
    rawText: 'Synthetic job ad text.',
    extracted: {
      language: 'en',
      title: 'Monitoring Assistant',
      company: 'Example Relief Partnership',
      requiredSkills: ['Kobo Toolbox', 'Excel'],
      responsibilities: ['Collect field data weekly'],
    },
  });
  const fromAd = await start(amina, { type: 'job_specific', jobDescriptionId: String(jd._id) });
  assert.equal(fromAd.status, 201);
  assert.equal(fromAd.body.data.interview.role, 'Monitoring Assistant');
  const sent = mock.requests[0].prompt;
  assert.match(sent, /Kobo Toolbox/);
  assert.match(sent, /Collect field data weekly/);

  // Another user's ad is not found (and no AI call).
  const foreign = await call(other, 'POST', '/interviews', {
    type: 'job_specific',
    jobDescriptionId: String(jd._id),
    language: 'en',
  });
  assert.equal(foreign.status, 404);

  const job = await Job.create({
    sourceKey: 'career-pages',
    externalId: `interview-${RUN_ID}`,
    hash: `job-hash-${RUN_ID}`,
    applyUrl: 'https://jobs.example.invalid/1',
    sources: [
      {
        sourceKey: 'career-pages',
        externalId: `interview-${RUN_ID}`,
        applyUrl: 'https://jobs.example.invalid/1',
      },
    ],
    title: 'Water Engineer',
    employer: 'Example Water Org',
    employerType: 'ngo',
    region: 'somaliland',
    description: 'Duties:\n- Design rural water supply systems for villages\n- Short',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  }).catch((err: Error) => {
    throw new Error(`test job could not be created: ${err.message}`);
  });
  const fromJob = await start(
    other,
    { type: 'job_specific', jobId: String(job._id), length: 3 },
    3,
  );
  assert.equal(fromJob.status, 201, JSON.stringify(fromJob.body));
  assert.equal(fromJob.body.data.interview.employer, 'Example Water Org');
  assert.match(mock.requests.at(-1)!.prompt, /Design rural water supply systems/);
});

test('private: another user cannot read, answer, cancel or delete a session', async () => {
  const { body } = await start(amina, { type: 'general', role: 'Teacher', length: 3 }, 3);
  const id = body.data.interview.id;
  for (const [method, path] of [
    ['GET', `/interviews/${id}`],
    ['POST', `/interviews/${id}/cancel`],
    ['DELETE', `/interviews/${id}`],
  ] as const) {
    assert.equal((await call(other, method, path)).status, 404, `${method} ${path}`);
  }
  const answer = await call(other, 'POST', `/interviews/${id}/answers`, {
    questionId: 'q1',
    answer: 'Hi',
  });
  assert.equal(answer.status, 404);
  assert.equal((await call(amina, 'DELETE', `/interviews/${id}`)).status, 204);
  assert.equal((await call(amina, 'GET', `/interviews/${id}`)).status, 404);
});

test('AI problems: a failed question request saves nothing; a failed feedback keeps the question open', async () => {
  mock.reply({ text: 'not json' }, { text: 'still not json' });
  const failed = await call(amina, 'POST', '/interviews', {
    type: 'general',
    role: 'Driver',
    language: 'so',
  });
  assert.equal(failed.status, 502);
  assert.equal(failed.body.error.code, 'AI_BAD_OUTPUT');
  assert.equal(await Interview.countDocuments({ role: 'Driver' }), 0);

  const { body } = await start(amina, { type: 'general', role: 'Driver', length: 3 }, 3);
  const id = body.data.interview.id;
  mock.reply({ text: 'x' }, { text: 'y' });
  const bad = await call(amina, 'POST', `/interviews/${id}/answers`, {
    questionId: 'q1',
    answer: 'I drive carefully.',
  });
  assert.equal(bad.status, 502);
  const still = await call(amina, 'GET', `/interviews/${id}`);
  assert.equal(still.body.data.interview.question.id, 'q1');
  assert.equal(still.body.data.interview.answered, 0);
});
