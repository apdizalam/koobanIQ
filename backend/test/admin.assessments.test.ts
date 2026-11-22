import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Assessment } from '../src/models/Assessment.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import { quizResult, type AskedQuestion } from '../src/services/quizEngine.js';
import { promoteToAdmin } from '../src/services/userService.js';

// TIQ-33 skills & assessments. Own database per run (dropped at the end);
// fictional users and quizzes written straight into the database.
const DB_NAME = `kobaniq_test_admin_quiz_${RUN_ID}`;
const PASSWORD = 'correct-horse-3';

let server: Server;
let baseUrl: string;
let admin: string;
let amina: { id: string; token: string };
let finishedId: string;

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
  return { status: res.status, body: (await res.json().catch(() => null)) as Json };
}

async function account(email: string, isAdmin = false) {
  await call(null, 'POST', '/auth/register', { email, password: PASSWORD, ageConfirmed: true });
  if (isAdmin) await promoteToAdmin(email);
  const { body } = await call(null, 'POST', '/auth/login', { email, password: PASSWORD });
  return { id: body.data.user.id as string, token: body.data.accessToken as string };
}

const question = (id: string, topic: string, difficulty: 'easy' | 'normal' | 'hard') => ({
  id,
  topic,
  difficulty,
  question: `Question ${id} about ${topic}?`,
  options: ['A', 'B', 'C', 'D'],
  answer: 0,
  explanation: `Because of ${topic}.`,
});
const answered = (id: string, topic: string, correct: boolean): AskedQuestion => ({
  questionId: id,
  choice: correct ? 0 : 2,
  correct,
  difficulty: 'normal',
  topic,
  answeredAt: new Date(),
});

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User, RefreshToken, Assessment, AuditLog].map((m) => m.syncIndexes()));
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = (await account('boss@admin-quiz.invalid', true)).token;
  amina = await account('amina@admin-quiz.invalid');

  const asked = [
    answered('q1', 'Formulas', true),
    answered('q2', 'Charts', false),
    answered('q3', 'Pivot tables', true),
  ];
  const common = {
    userId: amina.id,
    skillId: new mongoose.Types.ObjectId(),
    language: 'en',
    length: 5,
    startDifficulty: 'normal',
    bank: [
      question('q1', 'Formulas', 'normal'),
      question('q2', 'Charts', 'normal'),
      question('q3', 'Pivot tables', 'normal'),
      question('q4', 'Macros', 'hard'),
    ],
    state: { difficulty: 'normal' },
  };
  const [finished] = await Assessment.create([
    {
      ...common,
      skillName: 'Microsoft Excel',
      status: 'finished',
      asked,
      result: quizResult(asked),
      finishedAt: new Date(),
    },
    { ...common, skillName: 'Python', status: 'in_progress', asked: asked.slice(0, 1) },
  ]);
  finishedId = String(finished._id);
  // A quiz saved before TIQ-33: no `flags` field at all (raw insert).
  await Assessment.collection.insertOne({
    ...common,
    userId: new mongoose.Types.ObjectId(amina.id),
    skillId: common.skillId,
    skillName: 'Report writing',
    status: 'cancelled',
    asked: [],
    result: null,
    createdAt: new Date(Date.now() - 60_000),
    updatedAt: new Date(Date.now() - 60_000),
  });
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('the list shows every quiz with its result; filters by status and skill', async () => {
  const all = await call(admin, 'GET', '/admin/assessments');
  assert.equal(all.status, 200);
  assert.equal(all.body.data.total, 3, 'also quizzes saved before flags existed');
  assert.deepEqual(all.body.data.summary, {
    finished: 1,
    inProgress: 1,
    cancelled: 1,
    flaggedQuestions: 0,
  });
  const old = all.body.data.items.find((i: Json) => i.skillName === 'Report writing');
  assert.equal(old.flags, 0);
  const excel = all.body.data.items.find((i: Json) => i.skillName === 'Microsoft Excel');
  assert.equal(excel.email, 'amina@admin-quiz.invalid');
  assert.equal(excel.scorePercent, 67);
  assert.equal(excel.answered, 3);
  assert.equal(excel.flags, 0);

  const finished = await call(admin, 'GET', '/admin/assessments?status=finished');
  assert.deepEqual(
    finished.body.data.items.map((i: Json) => i.skillName),
    ['Microsoft Excel'],
  );
  const py = await call(admin, 'GET', '/admin/assessments?skill=pyth');
  assert.deepEqual(
    py.body.data.items.map((i: Json) => i.skillName),
    ['Python'],
  );
  assert.equal((await call(admin, 'GET', '/admin/assessments?status=done')).status, 400);
});

test('the detail shows each answered question with the right answer and the choice', async () => {
  const { body } = await call(admin, 'GET', `/admin/assessments/${finishedId}`);
  const a = body.data.assessment;
  assert.equal(a.result.scorePercent, 67);
  assert.equal(a.questions.length, 3, 'only answered questions');
  assert.deepEqual(
    a.questions.map((q: Json) => [q.number, q.id, q.correct, q.answer, q.choice]),
    [
      [1, 'q1', true, 0, 0],
      [2, 'q2', false, 0, 2],
      [3, 'q3', true, 0, 0],
    ],
  );
  assert.equal(a.questions[1].question, 'Question q2 about Charts?');
  assert.equal(a.questions[1].explanation, 'Because of Charts.');
  assert.equal((await call(admin, 'GET', '/admin/assessments/nope')).status, 404);
});

test('flagging a bad question is audited and leaves the result as it was', async () => {
  const path = `/admin/assessments/${finishedId}/questions/q2/flag`;
  const flagged = await call(admin, 'POST', path, { reason: 'Two options are correct.' });
  assert.equal(flagged.status, 200);
  const q2 = flagged.body.data.assessment.questions[1];
  assert.equal(q2.flag.reason, 'Two options are correct.');
  assert.equal(q2.flag.by, 'boss@admin-quiz.invalid');
  assert.equal(flagged.body.data.assessment.result.scorePercent, 67, 'result unchanged');

  const list = await call(admin, 'GET', '/admin/assessments');
  assert.equal(list.body.data.summary.flaggedQuestions, 1);

  const audit = await AuditLog.findOne({ action: 'assessment.flag_question' }).lean();
  assert.equal(audit?.targetId, amina.id);
  assert.deepEqual(audit?.after, { flag: 'Two options are correct.' });

  // Flagging again replaces the reason (still one flag).
  await call(admin, 'POST', path, { reason: 'The answer key is wrong.' });
  const doc = await Assessment.findById(finishedId).lean();
  assert.equal(doc?.flags.length, 1);
  assert.equal(doc?.flags[0].reason, 'The answer key is wrong.');

  const removed = await call(admin, 'DELETE', path);
  assert.equal(removed.body.data.assessment.questions[1].flag, null);
  assert.equal(await AuditLog.countDocuments({ action: 'assessment.unflag_question' }), 1);
  await call(admin, 'DELETE', path); // nothing to remove: no second record
  assert.equal(await AuditLog.countDocuments({ action: 'assessment.unflag_question' }), 1);
});

test('a flag needs a short reason and an answered question; only admins', async () => {
  const path = `/admin/assessments/${finishedId}/questions/q2/flag`;
  assert.equal((await call(admin, 'POST', path, { reason: '  ' })).status, 400);
  assert.equal((await call(admin, 'POST', path, { reason: 'x'.repeat(301) })).status, 400);
  const unasked = await call(admin, 'POST', `/admin/assessments/${finishedId}/questions/q4/flag`, {
    reason: 'Never asked',
  });
  assert.equal(unasked.status, 404);
  assert.equal((await call(amina.token, 'GET', '/admin/assessments')).status, 403);
  assert.equal((await call(amina.token, 'POST', path, { reason: 'Mine' })).status, 403);
});
