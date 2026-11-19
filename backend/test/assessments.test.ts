import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { setAiProviderForTests } from '../src/ai/aiService.js';
import { createMockProvider } from '../src/ai/mock.js';
import { quizBankSchema, type QuizBankQuestion } from '../src/ai/schemas/quiz.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Assessment } from '../src/models/Assessment.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { Skill } from '../src/models/Skill.js';
import { UsageRecord } from '../src/models/UsageRecord.js';
import { User } from '../src/models/User.js';
import {
  afterAnswer,
  pickNext,
  prepareBank,
  quizResult,
  type AskedQuestion,
  type BankQuestion,
} from '../src/services/quizEngine.js';
import { RUN_ID } from './support/testRun.js';

// TIQ-13: adaptive skill quizzes. Own database per run, fictional accounts, mock AI.
const DB_NAME = `kobaniq_test_quiz_${RUN_ID}`;
const PASSWORD = 'correct-horse-13q';
const TOPICS = ['Formulas', 'Charts', 'Sorting', 'Pivot tables', 'Shortcuts'];
const LEVELS = ['easy', 'normal', 'hard'] as const;

/** A valid bank: 5 topics × 3 difficulties; the right option is written first (the server shuffles). */
const bank = (): { questions: QuizBankQuestion[] } => ({
  questions: LEVELS.flatMap((difficulty) =>
    TOPICS.map((topic) => ({
      topic,
      difficulty,
      question: `${difficulty} question about ${topic}?`,
      options: [`Right ${topic} ${difficulty}`, 'Wrong A', 'Wrong B', 'Wrong C'],
      answer: 0,
      explanation: `Because of ${topic}.`,
    })),
  ),
});

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

async function skill(token: string, name = 'Microsoft Excel') {
  const res = await call(token, 'POST', '/skills', { name, selfLevel: 'mid' });
  return res.body.data.skill.id as string;
}

/** The right option for the quiz's current question (read from the stored bank). */
async function rightChoice(assessmentId: string) {
  const doc = await Assessment.findById(assessmentId).lean();
  const q = (doc!.bank as BankQuestion[]).find((b) => b.id === doc!.currentQuestionId)!;
  return { questionId: q.id, right: q.answer, wrong: (q.answer + 1) % 4, topic: q.topic };
}

async function answer(token: string, id: string, correct: boolean) {
  const { questionId, right, wrong } = await rightChoice(id);
  return call(token, 'POST', `/assessments/${id}/answers`, {
    questionId,
    choice: correct ? right : wrong,
  });
}

async function start(token: string, skillId: string, difficulty = 'normal', length?: number) {
  mock.reply({ json: bank() });
  return call(token, 'POST', '/assessments', {
    skillId,
    difficulty,
    language: 'en',
    ...(length ? { length } : {}),
  });
}

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all(
    [User, RefreshToken, Skill, Assessment, UsageRecord].map((m) => m.syncIndexes()),
  );
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // A normal account (not a test account): quizzes send no personal data, so they work for everyone.
  amina = await account('amina@quiz.invalid');
  other = await account('hodan@quiz.invalid');
  aminaId = (await User.findOne({ email: 'amina@quiz.invalid' }))!._id;
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

// ------------------------------------------------------------------ the engine (no database)

const engineBank = () => prepareBank(bank().questions);
const asked = (q: BankQuestion, correct: boolean): AskedQuestion => ({
  questionId: q.id,
  choice: correct ? q.answer : (q.answer + 1) % 4,
  correct,
  difficulty: q.difficulty,
  topic: q.topic,
});

test('End Test (engine): 3 correct answers → the difficulty goes up', () => {
  const b = engineBank();
  let state = { difficulty: 'easy' as const, streak: 0, focusTopic: null } as Parameters<
    typeof afterAnswer
  >[0];
  const done: AskedQuestion[] = [];
  for (let i = 0; i < 3; i += 1) {
    const q = pickNext(b, done, state)!;
    assert.equal(q.difficulty, 'easy');
    done.push(asked(q, true));
    state = afterAnswer(state, q, true);
  }
  assert.equal(state.difficulty, 'normal');
  assert.equal(pickNext(b, done, state)!.difficulty, 'normal');
  // Never above hard.
  assert.equal(
    afterAnswer({ difficulty: 'hard', streak: 2, focusTopic: null }, b[0], true).difficulty,
    'hard',
  );
});

test('End Test (engine): a wrong answer → the next question is on the same topic, a step easier', () => {
  const b = engineBank();
  const state = { difficulty: 'normal' as const, streak: 0, focusTopic: null };
  const first = pickNext(b, [], state)!;
  const next = pickNext(b, [asked(first, false)], afterAnswer(state, first, false))!;
  assert.equal(next.topic, first.topic);
  assert.equal(next.difficulty, 'easy');
  // A right answer clears the focus: then a new topic.
  const after = pickNext(
    b,
    [asked(first, false), asked(next, true)],
    afterAnswer(afterAnswer(state, first, false), next, true),
  )!;
  assert.notEqual(after.topic, first.topic);
});

test('engine: options are shuffled but the right option stays right; level from the answers', () => {
  const original = bank().questions;
  const shuffled = prepareBank(original);
  shuffled.forEach((q, i) => {
    assert.equal(q.options[q.answer], original[i].options[0]);
    assert.deepEqual([...q.options].sort(), [...original[i].options].sort());
  });

  const mk = (difficulty: 'easy' | 'normal' | 'hard', correct: boolean, topic = 'T') =>
    ({ questionId: 'x', choice: 0, correct, difficulty, topic }) as AskedQuestion;
  assert.equal(quizResult([mk('hard', true), mk('hard', true), mk('hard', true)]).level, 'expert');
  assert.equal(
    quizResult([mk('normal', true), mk('normal', true), mk('normal', true)]).level,
    'advanced',
  );
  assert.equal(quizResult([mk('easy', true), mk('easy', true), mk('normal', true)]).level, 'mid');
  assert.equal(
    quizResult([mk('easy', false), mk('easy', true), mk('easy', false)]).level,
    'beginner',
  );
  const r = quizResult([mk('easy', true, 'A'), mk('easy', false, 'B'), mk('normal', true, 'B')]);
  assert.deepEqual(r.strengths, ['A']);
  assert.deepEqual(r.gaps, ['B']);
  assert.equal(r.scorePercent, 67);
});

test('End Test: every generated bank passes Zod validation; bad banks are refused', () => {
  assert.equal(quizBankSchema.safeParse(bank()).success, true);
  const broken = [
    { questions: bank().questions.slice(0, 14) },
    { questions: bank().questions.map((q, i) => (i === 0 ? { ...q, difficulty: 'hard' } : q)) },
    { questions: bank().questions.map((q, i) => (i === 0 ? { ...q, answer: 4 } : q)) },
    {
      questions: bank().questions.map((q, i) =>
        i === 0 ? { ...q, options: ['a', 'a', 'b', 'c'] } : q,
      ),
    },
    {
      questions: bank().questions.map((q, i) => (i === 0 ? { ...q, options: ['a', 'b', 'c'] } : q)),
    },
    { questions: bank().questions.map((q) => ({ ...q, topic: 'Same' })) },
    { questions: bank().questions.map((q, i) => (i === 0 ? { ...q, hint: 'x' } : q)) },
  ];
  for (const b of broken) assert.equal(quizBankSchema.safeParse(b).success, false);
});

// ------------------------------------------------------------------ the API

test('start: only the skill name goes to the AI; the app never gets the answers', async () => {
  const skillId = await skill(amina);
  const res = await start(amina, skillId);
  assert.equal(res.status, 201);
  const a = res.body.data.assessment;
  assert.equal(a.status, 'in_progress');
  assert.equal(a.skillName, 'Microsoft Excel');
  assert.equal(a.question.number, 1);
  assert.equal(a.question.total, 5);
  assert.equal(a.question.difficulty, 'normal');
  assert.equal(a.question.options.length, 4);
  assert.equal('answer' in a.question, false);
  assert.equal('explanation' in a.question, false);
  assert.equal(JSON.stringify(res.body).includes('Because of'), false, 'no explanations yet');

  assert.equal(mock.requests.length, 1);
  const sent = mock.requests[0].system + mock.requests[0].prompt;
  assert.ok(sent.includes('Microsoft Excel'));
  assert.equal(sent.includes('amina'), false, 'no email or other personal data');
  assert.equal(await UsageRecord.countDocuments({ feature: 'skill_quiz' }), 1);
});

test('start: inputs are checked; another user’s skill is not found', async () => {
  const skillId = await skill(amina, 'Report writing');
  for (const [body, field] of [
    [{ difficulty: 'normal', language: 'en' }, 'skillId'],
    [{ skillId, difficulty: 'expert', language: 'en' }, 'difficulty'],
    [{ skillId, difficulty: 'normal' }, 'language'],
    [{ skillId, difficulty: 'normal', language: 'en', length: 7 }, 'length'],
    [{ skillId, difficulty: 'normal', language: 'en', extra: 1 }, 'extra'],
  ] as const) {
    const res = await call(amina, 'POST', '/assessments', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok(res.body.meta.details[field], field);
  }
  const theirs = await call(other, 'POST', '/assessments', {
    skillId,
    difficulty: 'normal',
    language: 'en',
  });
  assert.equal(theirs.status, 404);
  assert.equal(theirs.body.error.code, 'SKILL_NOT_FOUND');
  assert.equal(mock.requests.length, 0, 'nothing sent to the AI');
});

test('End Test (API): 3 right answers raise the difficulty; a wrong one probes the same topic', async () => {
  const skillId = await skill(amina, 'Spreadsheets');
  const id = (await start(amina, skillId, 'easy', 10)).body.data.assessment.id;

  let res;
  for (let i = 0; i < 3; i += 1) res = await answer(amina, id, true);
  assert.equal(res!.body.data.feedback.correct, true);
  assert.equal(res!.body.data.assessment.question.difficulty, 'normal', 'up after 3 right');

  const { topic } = await rightChoice(id);
  res = await answer(amina, id, false);
  const feedback = res.body.data.feedback;
  assert.equal(feedback.correct, false);
  assert.equal(typeof feedback.correctChoice, 'number');
  assert.match(feedback.explanation, /Because of/);
  const next = res.body.data.assessment.question;
  assert.equal(next.topic, topic, 'same topic after a wrong answer');
  assert.equal(next.difficulty, 'easy', 'one step easier');
});

test('finishing sets the skill’s assessed level and gaps; the user’s own level stays', async () => {
  const skillId = await skill(amina, 'Data entry');
  const id = (await start(amina, skillId, 'normal')).body.data.assessment.id;
  const answers = [true, true, true, false, true];
  let res;
  for (const correct of answers) res = await answer(amina, id, correct);
  const done = res!.body.data.assessment;
  assert.equal(done.status, 'finished');
  assert.equal(done.question, null);
  assert.equal(done.result.total, 5);
  assert.equal(done.result.correct, 4);
  assert.equal(done.result.gaps.length, 1);
  // normal ✓✓✓ → hard ✗ → normal ✓: 8 of 15 points (53 %) → advanced.
  assert.equal(done.result.level, 'advanced');

  const stored = await Skill.findById(skillId).lean();
  assert.equal(stored?.assessedLevel, done.result.level);
  assert.deepEqual(stored?.gaps, done.result.gaps);
  assert.ok(stored?.lastAssessedAt);
  assert.equal(stored?.selfLevel, 'mid', 'self-reported level unchanged');

  const again = await call(amina, 'POST', `/assessments/${id}/answers`, {
    questionId: 'q1',
    choice: 0,
  });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.code, 'ASSESSMENT_NOT_IN_PROGRESS');

  const history = (await call(amina, 'GET', '/assessments')).body.data.assessments;
  const item = history.find((h: Json) => h.id === id);
  assert.equal(item.status, 'finished');
  assert.equal('question' in item, false);
  assert.equal(
    (await call(amina, 'GET', `/assessments/${id}`)).body.data.assessment.result.correct,
    4,
  );
});

test('answers: only the current question, a valid choice; others get 404', async () => {
  const skillId = await skill(amina, 'Bookkeeping');
  const id = (await start(amina, skillId)).body.data.assessment.id;
  const { questionId } = await rightChoice(id);
  const stale = await call(amina, 'POST', `/assessments/${id}/answers`, {
    questionId: questionId === 'q1' ? 'q2' : 'q1',
    choice: 0,
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'QUESTION_NOT_CURRENT');
  for (const choice of [4, -1, 1.5, '1']) {
    const bad = await call(amina, 'POST', `/assessments/${id}/answers`, { questionId, choice });
    assert.equal(bad.status, 400, String(choice));
  }
  const theirs = await call(other, 'POST', `/assessments/${id}/answers`, { questionId, choice: 0 });
  assert.equal(theirs.status, 404);
  assert.equal((await call(other, 'GET', `/assessments/${id}`)).status, 404);
  assert.equal((await Assessment.findById(id).lean())?.asked.length, 0);
});

test('resume and cancel: leaving is safe; a new quiz cancels the unfinished one', async () => {
  const skillId = await skill(amina, 'Customer service');
  const first = (await start(amina, skillId)).body.data.assessment;
  await answer(amina, first.id, true);
  const resumed = (await call(amina, 'GET', `/assessments/${first.id}`)).body.data.assessment;
  assert.equal(resumed.status, 'in_progress');
  assert.equal(resumed.question.number, 2);

  const second = (await start(amina, skillId)).body.data.assessment;
  assert.equal(
    (await call(amina, 'GET', `/assessments/${first.id}`)).body.data.assessment.status,
    'cancelled',
  );
  const cancelled = await call(amina, 'POST', `/assessments/${second.id}/cancel`);
  assert.equal(cancelled.body.data.assessment.status, 'cancelled');
  assert.equal(cancelled.body.data.assessment.question, null);
  const stored = await Skill.findById(skillId).lean();
  assert.equal(stored?.assessedLevel ?? null, null, 'cancelled quizzes change nothing');
});

test('bad AI output: retried once, then a clean error and nothing saved', async () => {
  const skillId = await skill(amina, 'Typing');
  const before = await Assessment.countDocuments({ userId: aminaId });
  const short = { questions: bank().questions.slice(0, 10) };
  mock.reply({ json: short }, { json: short });
  const res = await call(amina, 'POST', '/assessments', {
    skillId,
    difficulty: 'normal',
    language: 'so',
  });
  assert.equal(res.status, 502);
  assert.equal(res.body.error.code, 'AI_BAD_OUTPUT');
  assert.equal(mock.requests.length, 2);
  assert.equal(await Assessment.countDocuments({ userId: aminaId }), before);
});
