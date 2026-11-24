import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Interview } from '../src/models/Interview.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import { promoteToAdmin } from '../src/services/userService.js';

// Admin → Interviews (read-only). Own database per run (dropped at the end);
// fictional users and practice sessions written straight into the database.
const DB_NAME = `kobaniq_test_admin_interviews_${RUN_ID}`;
const PASSWORD = 'correct-horse-5';
const DAY = 24 * 60 * 60 * 1000;

/** Words that only appear in the users' answers and the AI feedback on them. */
const PRIVATE = [
  'MY PRIVATE ANSWER',
  'JAWAAB GAAR AH',
  'FEEDBACK SUMMARY',
  'STRENGTH NOTE',
  'IMPROVE NOTE',
  'BETTER ANSWER TEXT',
];

let server: Server;
let baseUrl: string;
let admin: string;
let amina: { id: string; token: string };
let finishedId: string;

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

const questions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `q${i + 1}`,
    question: `Question ${i + 1} about the role?`,
    focus: `Focus ${i + 1}`,
  }));

const answer = (questionId: string, score: number, at: Date) => ({
  questionId,
  answer: `${PRIVATE[0]} ${questionId}`,
  feedback: {
    score,
    summary: PRIVATE[2],
    strengths: [PRIVATE[3]],
    improvements: [PRIVATE[4]],
    betterAnswer: PRIVATE[5],
  },
  answeredAt: at,
});

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User, RefreshToken, Interview].map((m) => m.syncIndexes()));
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = (await account('boss@admin-interviews.invalid', true)).token;
  amina = await account('amina@admin-interviews.invalid');

  const userId = new mongoose.Types.ObjectId(amina.id);
  const ago = (ms: number) => new Date(Date.now() - ms);
  const inserted = await Interview.collection.insertMany([
    {
      userId,
      type: 'job_specific',
      role: 'Data Officer',
      employer: 'Example Relief Org',
      skills: ['SQL'],
      responsibilities: ['Reports'],
      language: 'en',
      length: 3,
      status: 'finished',
      questions: questions(3),
      answers: [
        answer('q1', 8, ago(2 * DAY)),
        answer('q2', 6, ago(2 * DAY)),
        answer('q3', 7, ago(2 * DAY)),
      ],
      finishedAt: ago(2 * DAY),
      createdAt: ago(2 * DAY + 600_000),
    },
    {
      userId,
      type: 'behavioral',
      role: 'Macallin',
      employer: null,
      language: 'so',
      length: 5,
      status: 'in_progress',
      questions: questions(5),
      answers: [{ ...answer('q1', 5, ago(60_000)), answer: PRIVATE[1] }],
      createdAt: ago(120_000),
    },
    {
      userId,
      type: 'general',
      role: 'Cashier',
      employer: null,
      language: 'en',
      length: 3,
      status: 'cancelled',
      questions: questions(3),
      answers: [],
      createdAt: ago(40 * DAY),
    },
  ]);
  finishedId = String(inserted.insertedIds[0]);
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('admins see every practice session, newest first, never the answers or feedback', async () => {
  const res = await call(admin, '/admin/interviews');
  assert.equal(res.status, 200);
  const { data } = res.body;
  assert.deepEqual(data.summary, { finished: 1, inProgress: 1, cancelled: 1, averageScore: 7 });
  assert.equal(data.total, 3);
  assert.deepEqual(
    data.items.map((i: Json) => [i.type, i.language, i.status, i.answered, i.averageScore]),
    [
      ['behavioral', 'so', 'in_progress', 1, 5],
      ['job_specific', 'en', 'finished', 3, 7],
      ['general', 'en', 'cancelled', 0, null],
    ],
  );
  const finished = data.items[1];
  assert.equal(finished.email, 'amina@admin-interviews.invalid');
  assert.equal(finished.role, 'Data Officer');
  assert.equal(finished.employer, 'Example Relief Org');
  assert.equal(finished.length, 3);
  assert.ok(finished.createdAt && finished.finishedAt);
  const text = JSON.stringify(data);
  for (const word of PRIVATE) assert.ok(!text.includes(word), `no "${word}" in the list`);
  assert.ok(!('answers' in finished) && !('questions' in finished));
});

test('filters: status, type, language, period, paging', async () => {
  const ids = async (query: string) =>
    (await call(admin, `/admin/interviews?${query}`)).body.data.items.map((i: Json) => i.role);
  assert.deepEqual(await ids('status=finished'), ['Data Officer']);
  assert.deepEqual(await ids('type=behavioral'), ['Macallin']);
  assert.deepEqual(await ids('language=en'), ['Data Officer', 'Cashier']);
  assert.deepEqual(await ids('period=day'), ['Macallin']);
  assert.deepEqual(await ids('period=week'), ['Macallin', 'Data Officer']);
  assert.deepEqual(await ids('period=year&language=en&status=cancelled'), ['Cashier']);

  // The cards follow the type, language and period filters (not status).
  const week = (await call(admin, '/admin/interviews?period=week&status=finished')).body.data;
  assert.deepEqual(week.summary, { finished: 1, inProgress: 1, cancelled: 0, averageScore: 7 });
  const so = (await call(admin, '/admin/interviews?language=so')).body.data;
  assert.equal(so.summary.averageScore, null, 'no finished Somali session yet');

  const paged = (await call(admin, '/admin/interviews?limit=2&page=2')).body.data;
  assert.equal(paged.total, 3);
  assert.deepEqual(
    paged.items.map((i: Json) => i.role),
    ['Cashier'],
  );
});

test('bad filters refused; only admins', async () => {
  for (const query of ['status=done', 'type=oral', 'language=fr', 'period=hour']) {
    const res = await call(admin, `/admin/interviews?${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  }
  assert.equal((await call(amina.token, '/admin/interviews')).status, 403);
  assert.equal((await call(null, '/admin/interviews')).status, 401);
  assert.equal((await call(amina.token, `/admin/interviews/${finishedId}`)).status, 403);
});

test('detail: the AI questions with each score, never the answer or feedback', async () => {
  const res = await call(admin, `/admin/interviews/${finishedId}`);
  assert.equal(res.status, 200);
  const { interview } = res.body.data;
  assert.equal(interview.email, 'amina@admin-interviews.invalid');
  assert.equal(interview.type, 'job_specific');
  assert.equal(interview.averageScore, 7);
  assert.equal(interview.answered, 3);
  assert.deepEqual(
    interview.questions.map((q: Json) => [q.number, q.id, q.focus, q.score]),
    [
      [1, 'q1', 'Focus 1', 8],
      [2, 'q2', 'Focus 2', 6],
      [3, 'q3', 'Focus 3', 7],
    ],
  );
  assert.equal(interview.questions[0].question, 'Question 1 about the role?');
  assert.ok(interview.questions[0].answeredAt);
  const text = JSON.stringify(res.body);
  for (const word of PRIVATE) assert.ok(!text.includes(word), `no "${word}" in the detail`);
  assert.ok(!('skills' in interview) && !('responsibilities' in interview));

  const missing = await call(admin, `/admin/interviews/${new mongoose.Types.ObjectId()}`);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'INTERVIEW_NOT_FOUND');
  assert.equal((await call(admin, '/admin/interviews/not-an-id')).status, 404);
});
