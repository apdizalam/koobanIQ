import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Cv } from '../src/models/Cv.js';
import { JobDescription } from '../src/models/JobDescription.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import { promoteToAdmin } from '../src/services/userService.js';

// TIQ-33 CVs (read-only). Own database per run (dropped at the end); fictional
// users, job ads and CVs written straight into the database.
const DB_NAME = `kobaniq_test_admin_cvs_${RUN_ID}`;
const PASSWORD = 'correct-horse-4';

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

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User, RefreshToken, Cv, JobDescription].map((m) => m.syncIndexes()));
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = (await account('boss@admin-cvs.invalid', true)).token;
  amina = await account('amina@admin-cvs.invalid');

  const userId = new mongoose.Types.ObjectId(amina.id);
  const ad = await JobDescription.collection.insertOne({
    userId,
    source: 'text',
    hash: 'admin-cvs-ad-1',
    extracted: { title: 'Data Officer', company: 'Example Relief Org' },
    createdAt: new Date(),
  });
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
  await Cv.collection.insertMany([
    {
      userId,
      jobDescriptionId: ad.insertedId,
      language: 'en',
      version: 1,
      status: 'exported',
      content: { summary: 'PRIVATE CV TEXT' },
      missingInfo: [{ type: 'requiredSkill', item: 'SQL' }],
      approvedAt: at(20),
      exportedAt: at(10),
      createdAt: at(30),
    },
    {
      userId,
      jobDescriptionId: ad.insertedId,
      language: 'so',
      version: 1,
      status: 'draft',
      content: { summary: 'QORAAL GAAR AH' },
      missingInfo: [],
      createdAt: at(5),
    },
  ]);
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('admins see every CV status, newest first, never the CV content', async () => {
  const res = await call(admin, '/admin/cvs');
  assert.equal(res.status, 200);
  const { data } = res.body;
  assert.deepEqual(data.summary, { draft: 1, approved: 0, exported: 1 });
  assert.equal(data.total, 2);
  assert.deepEqual(
    data.items.map((c: Json) => [c.language, c.status, c.missingInfo]),
    [
      ['so', 'draft', 0],
      ['en', 'exported', 1],
    ],
  );
  const exported = data.items[1];
  assert.equal(exported.email, 'amina@admin-cvs.invalid');
  assert.equal(exported.jobTitle, 'Data Officer');
  assert.equal(exported.company, 'Example Relief Org');
  assert.ok(exported.approvedAt && exported.exportedAt);
  const text = JSON.stringify(data);
  assert.ok(!text.includes('PRIVATE CV TEXT') && !text.includes('QORAAL GAAR AH'), 'no CV content');
  assert.ok(!('content' in exported));
});

test('filter by status; bad status refused; only admins', async () => {
  const drafts = await call(admin, '/admin/cvs?status=draft');
  assert.deepEqual(
    drafts.body.data.items.map((c: Json) => c.status),
    ['draft'],
  );
  assert.equal((await call(admin, '/admin/cvs?status=printed')).status, 400);
  assert.equal((await call(amina.token, '/admin/cvs')).status, 403);
  assert.equal((await call(null, '/admin/cvs')).status, 401);
});
