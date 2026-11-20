import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { isTimeZone, periodRange } from '../src/lib/zonedTime.js';
import { Assessment } from '../src/models/Assessment.js';
import { Cv } from '../src/models/Cv.js';
import { Interview } from '../src/models/Interview.js';
import { JobDescription } from '../src/models/JobDescription.js';
import { JobMatch } from '../src/models/JobMatch.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { ResearchRun } from '../src/models/ResearchRun.js';
import { SavedJob } from '../src/models/SavedJob.js';
import { User } from '../src/models/User.js';
import { countPeriod, getReport } from '../src/services/reportService.js';
import { RUN_ID } from './support/testRun.js';

// TIQ-20: reports from stored data. Own database per run, fictional accounts.
const DB_NAME = `kobaniq_test_reports_${RUN_ID}`;
const PASSWORD = 'correct-horse-20r';
const TZ = 'Africa/Mogadishu'; // UTC+3, no daylight saving
const NOW = new Date('2026-11-20T10:00:00Z'); // Friday 13:00 in Mogadishu

let server: Server;
let baseUrl: string;
let amina: string;
let aminaId: mongoose.Types.ObjectId;
let otherId: mongoose.Types.ObjectId;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads any answer
type Json = any;

async function call(token: string | null, path: string) {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return { status: res.status, body: (await res.json()) as Json };
}

async function account(email: string) {
  await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, ageConfirmed: true }),
  });
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return ((await res.json()) as Json).data.accessToken as string;
}

const at = (iso: string) => new Date(iso);
const oid = () => new mongoose.Types.ObjectId();

/**
 * Records at chosen times (inserted directly, so createdAt is exactly as
 * given). "Today" in Mogadishu is 2026-11-19T21:00Z – 2026-11-20T21:00Z.
 */
async function seed(userId: mongoose.Types.ObjectId) {
  const times = [
    '2026-11-20T09:30:00Z', // today, this hour? no (10:00 local hour starts 10:00Z)
    '2026-11-20T10:05:00Z', // today, this hour
    '2026-11-19T22:00:00Z', // today in Mogadishu (01:00 local), yesterday in UTC
    '2026-11-19T20:00:00Z', // yesterday in Mogadishu (23:00 local)
    '2026-11-16T05:00:00Z', // this week (Monday)
    '2026-11-15T20:00:00Z', // last week in Mogadishu (Sunday 23:00 local)
    '2026-11-01T08:00:00Z', // this month
    '2026-02-10T08:00:00Z', // this year
    '2025-12-31T20:00:00Z', // last year in Mogadishu (23:00 local, 31 Dec)
  ].map(at);
  for (const [i, t] of times.entries()) {
    await Cv.collection.insertOne({
      userId,
      jobDescriptionId: oid(),
      language: 'en',
      version: 1,
      status: i % 3 === 0 ? 'exported' : i % 2 === 0 ? 'approved' : 'draft',
      createdAt: t,
      approvedAt: i % 2 === 0 ? t : undefined,
      exportedAt: i % 3 === 0 ? t : undefined,
    });
    await Assessment.collection.insertOne({
      userId,
      status: i % 2 === 0 ? 'finished' : 'cancelled',
      finishedAt: t,
      result: { scorePercent: 40 + i * 5 },
      createdAt: t,
    });
    await Interview.collection.insertOne({
      userId,
      status: 'finished',
      finishedAt: t,
      answers: [
        { questionId: 'q1', answer: 'x', answeredAt: t, feedback: { score: 3 + (i % 5) } },
        { questionId: 'q2', answer: 'y', answeredAt: t, feedback: { score: 6 } },
      ],
      createdAt: t,
    });
    await JobDescription.collection.insertOne({ userId, hash: `hash-${i}`, createdAt: t });
    await ResearchRun.collection.insertOne({ userId, startedAt: t, jobsFound: i, createdAt: t });
    await SavedJob.collection.insertOne({ userId, jobId: oid(), createdAt: t });
    await JobMatch.collection.insertOne({
      userId,
      jobId: oid(),
      recommended: i % 2 === 1,
      computedAt: t,
    });
  }
}

/** The same numbers with plain queries, written separately from the service. */
async function direct(userId: mongoose.Types.ObjectId, start: Date, end: Date) {
  const r = { $gte: start, $lt: end };
  const quizzes = await Assessment.find({ userId, status: 'finished', finishedAt: r }).lean();
  const qScores = quizzes.map((q) => (q.result as { scorePercent: number }).scorePercent);
  const interviews = await Interview.find({ userId }).lean();
  const answers = interviews.flatMap((s) =>
    (s.answers as { answeredAt: Date; feedback: { score: number } }[]).filter(
      (a) => a.answeredAt >= start && a.answeredAt < end,
    ),
  );
  const runs = await ResearchRun.find({ userId, startedAt: r }).lean();
  const avg = (v: number[]) =>
    v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
  return {
    quizzes: { finished: quizzes.length, averageScorePercent: avg(qScores) },
    interviews: {
      finished: await Interview.countDocuments({ userId, status: 'finished', finishedAt: r }),
      answers: answers.length,
      averageScore: avg(answers.map((a) => a.feedback.score)),
    },
    cvs: {
      created: await Cv.countDocuments({ userId, createdAt: r }),
      approved: await Cv.countDocuments({ userId, approvedAt: r }),
      exported: await Cv.countDocuments({ userId, exportedAt: r }),
    },
    jobs: {
      jobAdsSaved: await JobDescription.countDocuments({ userId, createdAt: r }),
      searches: runs.length,
      jobsFound: runs.reduce((s, x) => s + (x.jobsFound ?? 0), 0),
      saved: await SavedJob.countDocuments({ userId, createdAt: r }),
      scored: await JobMatch.countDocuments({ userId, computedAt: r }),
      recommended: await JobMatch.countDocuments({ userId, computedAt: r, recommended: true }),
    },
  };
}

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User, RefreshToken].map((m) => m.syncIndexes()));
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  amina = await account('amina@reports.invalid');
  await account('hodan@reports.invalid');
  aminaId = (await User.findOne({ email: 'amina@reports.invalid' }))!._id;
  otherId = (await User.findOne({ email: 'hodan@reports.invalid' }))!._id;
  await seed(aminaId);
  await seed(otherId); // another user's records must never be counted
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('periods: boundaries are the user’s local hour, midnight, Monday, 1st and 1 January', () => {
  const iso = (d: Date) => d.toISOString();
  const hour = periodRange('hour', TZ, NOW);
  assert.equal(iso(hour.start), '2026-11-20T10:00:00.000Z');
  assert.equal(iso(hour.end), '2026-11-20T11:00:00.000Z');
  const day = periodRange('day', TZ, NOW);
  assert.equal(iso(day.start), '2026-11-19T21:00:00.000Z'); // local midnight, not UTC
  assert.equal(iso(day.end), '2026-11-20T21:00:00.000Z');
  assert.equal(iso(day.previous.start), '2026-11-18T21:00:00.000Z');
  const week = periodRange('week', TZ, NOW);
  assert.equal(iso(week.start), '2026-11-15T21:00:00.000Z'); // Monday 16 Nov, 00:00 local
  assert.equal(iso(week.previous.start), '2026-11-08T21:00:00.000Z');
  const month = periodRange('month', TZ, NOW);
  assert.equal(iso(month.start), '2026-10-31T21:00:00.000Z');
  assert.equal(iso(month.end), '2026-11-30T21:00:00.000Z');
  const year = periodRange('year', TZ, NOW);
  assert.equal(iso(year.start), '2025-12-31T21:00:00.000Z');
  assert.equal(iso(year.previous.start), '2024-12-31T21:00:00.000Z');
  // UTC users: midnight UTC.
  assert.equal(iso(periodRange('day', 'UTC', NOW).start), '2026-11-20T00:00:00.000Z');
  // A daylight-saving zone: New York's 1 Nov 2026 has 25 hours (clocks go back).
  const ny = periodRange('day', 'America/New_York', at('2026-11-02T12:00:00Z'));
  assert.equal(iso(ny.start), '2026-11-02T05:00:00.000Z');
  assert.equal(iso(ny.previous.start), '2026-11-01T04:00:00.000Z');
});

test('time zones: real IANA names only', () => {
  assert.equal(isTimeZone('Africa/Mogadishu'), true);
  assert.equal(isTimeZone('UTC'), true);
  assert.equal(isTimeZone('Mars/Olympus'), false);
  assert.equal(isTimeZone(''), false);
  assert.equal(isTimeZone(42), false);
});

test('End Test: every number equals a direct database query for the same period', async () => {
  for (const period of ['hour', 'day', 'week', 'month', 'year'] as const) {
    const report = await getReport(aminaId, period, TZ, NOW);
    for (const which of ['current', 'previous'] as const) {
      const part = report[which];
      const { start, end, ...numbers } = part;
      assert.deepEqual(
        numbers,
        await direct(aminaId, new Date(start), new Date(end)),
        `${period} ${which}`,
      );
    }
  }
});

test('End Test: day boundaries follow the user’s time zone', async () => {
  // 2026-11-19T22:00Z is 01:00 on 20 Nov in Mogadishu: today there, yesterday in UTC.
  const local = await getReport(aminaId, 'day', TZ, NOW);
  const utc = await getReport(aminaId, 'day', 'UTC', NOW);
  assert.equal(local.current.cvs.created, 3); // 09:30Z, 10:05Z, 22:00Z (19th)
  assert.equal(utc.current.cvs.created, 2); // 09:30Z, 10:05Z
  assert.equal(local.previous.cvs.created, 1); // 20:00Z on the 19th = 23:00 local
  const hour = await getReport(aminaId, 'hour', TZ, NOW);
  assert.equal(hour.current.cvs.created, 1);
  // The year in Mogadishu starts at 2025-12-31T21:00Z: 20:00Z that evening is last year.
  const year = await getReport(aminaId, 'year', TZ, NOW);
  assert.equal(year.current.cvs.created, 8);
  assert.equal(year.previous.cvs.created, 1);
});

test('nothing to average gives null, not 0; an empty period is all zeros', async () => {
  const empty = await countPeriod(aminaId, at('2020-01-01T00:00:00Z'), at('2020-02-01T00:00:00Z'));
  assert.equal(empty.quizzes.finished, 0);
  assert.equal(empty.quizzes.averageScorePercent, null);
  assert.equal(empty.interviews.averageScore, null);
  assert.equal(empty.jobs.jobsFound, 0);
});

test('API: own numbers only, period and time zone checked; no applications number', async () => {
  const res = await call(amina, `/reports?period=year&tz=${encodeURIComponent(TZ)}`);
  assert.equal(res.status, 200);
  const report = res.body.data.report;
  assert.equal(report.period, 'year');
  assert.equal(report.timeZone, TZ);
  // Only Amina's records (Hodan has the same seed): the year count is hers alone.
  const start = new Date(report.current.start);
  const end = new Date(report.current.end);
  assert.equal(
    report.current.cvs.created,
    await Cv.countDocuments({ userId: aminaId, createdAt: { $gte: start, $lt: end } }),
  );
  assert.equal(JSON.stringify(report).includes('application'), false);

  assert.equal((await call(amina, '/reports?period=decade')).status, 400);
  const badTz = await call(amina, '/reports?period=day&tz=Mars%2FOlympus');
  assert.equal(badTz.status, 400);
  assert.equal(badTz.body.error.code, 'VALIDATION_ERROR');
  assert.equal((await call(null, '/reports')).status, 401);
  // Default: a week in UTC.
  const plain = await call(amina, '/reports');
  assert.equal(plain.body.data.report.period, 'week');
  assert.equal(plain.body.data.report.timeZone, 'UTC');
});
