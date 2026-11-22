import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { csvCell, toCsv } from '../src/lib/csv.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Cv } from '../src/models/Cv.js';
import { Job } from '../src/models/Job.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { UsageRecord } from '../src/models/UsageRecord.js';
import { User } from '../src/models/User.js';
import { EXPORT_KINDS } from '../src/services/adminExportService.js';
import { promoteToAdmin } from '../src/services/userService.js';

// TIQ-33 reports (CSV exports). Own database per run (dropped at the end);
// fictional users and records.
const DB_NAME = `kobaniq_test_admin_reports_${RUN_ID}`;
const PASSWORD = 'correct-horse-8';
const DAY = 24 * 60 * 60 * 1000;

let server: Server;
let baseUrl: string;
let admin: string;
let amina: { id: string; token: string };

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

/** The CSV's data lines (no byte-order mark, no header). */
const BOM = String.fromCharCode(0xfeff);
const lines = (csv: string) => (csv.startsWith(BOM) ? csv.slice(1) : csv).trimEnd().split('\r\n');

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all(
    [User, RefreshToken, UsageRecord, Job, Cv, AuditLog].map((m) => m.syncIndexes()),
  );
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = (await account('boss@admin-reports.invalid', true)).token;
  amina = await account('amina@admin-reports.invalid');
  const userId = new mongoose.Types.ObjectId(amina.id);

  await UsageRecord.collection.insertMany([
    {
      userId,
      feature: 'cv_generation',
      provider: 'gemini',
      model: 'm',
      status: 'ok',
      inputTokens: 100,
      outputTokens: 50,
      attempts: 1,
      createdAt: new Date(Date.now() - 2 * 3600_000),
    },
    {
      userId,
      feature: 'skill_quiz',
      provider: 'gemini',
      model: 'm',
      status: 'timeout',
      inputTokens: 10,
      outputTokens: 0,
      attempts: 1,
      createdAt: new Date(Date.now() - 20 * DAY),
    },
  ]);
  await Job.collection.insertOne({
    hash: 'reports-job-1',
    sourceKey: 'board-a',
    externalId: 'r1',
    applyUrl: 'https://jobs.example.invalid/r1',
    sources: [
      { sourceKey: 'board-a', externalId: 'r1', applyUrl: 'https://jobs.example.invalid/r1' },
    ],
    title: '=HYPERLINK("http://evil.invalid","Data, Officer")',
    employer: 'Example "Relief" Org',
    employerType: 'ngo',
    region: 'somaliland',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  });
  await Cv.collection.insertOne({
    userId,
    jobDescriptionId: new mongoose.Types.ObjectId(),
    language: 'so',
    version: 1,
    status: 'draft',
    content: { summary: 'PRIVATE CV TEXT' },
    missingInfo: [],
    createdAt: new Date(),
  });
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('CSV cells: quoting, and formulas made harmless', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a, b'), '"a, b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('-5 apples'), "'-5 apples");
  assert.equal(csvCell(-5), '-5', 'real numbers stay numbers');
  assert.equal(csvCell(true), 'yes');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(new Date('2026-11-22T10:00:00.000Z')), '2026-11-22T10:00:00.000Z');
  assert.ok(toCsv(['a'], [[1]]).startsWith(BOM), 'UTF-8 byte-order mark');
});

test('each export is a CSV with a header row; the period filters by date', async () => {
  for (const kind of EXPORT_KINDS) {
    const res = await call(admin, `/admin/reports/${kind}?period=all`);
    assert.equal(res.status, 200, kind);
    assert.match(
      res.body.data.filename,
      new RegExp(`^kobaniq-${kind}-all-\\d{4}-\\d{2}-\\d{2}\\.csv$`),
    );
    assert.equal(lines(res.body.data.csv).length, res.body.data.rows + 1, `${kind}: header + rows`);
  }
  const week = await call(admin, '/admin/reports/usage?period=week');
  assert.equal(week.body.data.rows, 1, 'only the recent AI request');
  assert.match(
    lines(week.body.data.csv)[1],
    /amina@admin-reports\.invalid,cv_generation,ok,100,50/,
  );
  const month = await call(admin, '/admin/reports/usage?period=month');
  assert.equal(month.body.data.rows, 2);
  // Default period: month.
  assert.equal((await call(admin, '/admin/reports/usage')).body.data.rows, 2);
});

test('job texts are escaped safely; CV text is never exported', async () => {
  const jobs = await call(admin, '/admin/reports/jobs?period=all');
  const row = lines(jobs.body.data.csv)[1];
  assert.ok(row.includes(`"'=HYPERLINK(""http://evil.invalid"",""Data, Officer"")"`), row);
  assert.ok(row.includes('"Example ""Relief"" Org"'));
  const cvs = await call(admin, '/admin/reports/cvs?period=all');
  assert.equal(cvs.body.data.rows, 1);
  assert.ok(!cvs.body.data.csv.includes('PRIVATE CV TEXT'));
  assert.match(lines(cvs.body.data.csv)[1], /amina@admin-reports\.invalid,,,so,1,draft,0/);
});

test('every export is audited; bad kind or period refused; only admins', async () => {
  await call(admin, '/admin/reports/users?period=year');
  const audit = await AuditLog.findOne({ action: 'report.export', targetId: 'users' })
    .sort({ createdAt: -1 })
    .lean();
  assert.deepEqual(audit?.after, { kind: 'users', period: 'year', rows: 2 });

  assert.equal((await call(admin, '/admin/reports/passwords')).status, 404);
  assert.equal((await call(admin, '/admin/reports/users?period=decade')).status, 400);
  assert.equal((await call(amina.token, '/admin/reports/users')).status, 403);
  assert.equal((await call(null, '/admin/reports/users')).status, 401);
});
