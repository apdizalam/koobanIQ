import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { Skill } from '../src/models/Skill.js';
import { User } from '../src/models/User.js';
import { recordAssessment } from '../src/services/skillService.js';
import { promoteToAdmin } from '../src/services/userService.js';

// Own database per run (dropped at the end). Clearly fake test users only.
const DB_NAME = `kobaniq_test_skills_${RUN_ID}`;
const PASSWORD = 'correct-horse-12';

let server: Server;
let baseUrl: string;
let amina: string;
let omar: string;

type PublicSkill = {
  id: string;
  name: string;
  category: string | null;
  selfLevel: string;
  assessedLevel: string | null;
  yearsExp: number | null;
  lastAssessedAt: string | null;
  gaps: string[];
};
type Body = {
  data: { skill?: PublicSkill; skills?: PublicSkill[]; counts?: Record<string, number> } | null;
  error: { code: string; message: string } | null;
  meta: { details?: Record<string, string> };
};

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
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Body };
}

async function account(email: string) {
  await call(null, 'POST', '/auth/register', { email, password: PASSWORD });
  const login = await call(null, 'POST', '/auth/login', { email, password: PASSWORD });
  return (login.body.data as unknown as { accessToken: string }).accessToken;
}

const userId = async (email: string) => (await User.findOne({ email }))!._id;

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.syncIndexes(),
    RefreshToken.syncIndexes(),
    Skill.syncIndexes(),
    AuditLog.syncIndexes(),
  ]);
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  amina = await account('amina@skills.invalid');
  omar = await account('omar@skills.invalid');
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('add, list, edit and delete a skill; signed-out gets 401', async () => {
  const added = await call(amina, 'POST', '/skills', {
    name: '  React   Native ',
    selfLevel: 'advanced',
    category: 'Frontend',
    yearsExp: 2,
  });
  assert.equal(added.status, 201);
  const skill = added.body.data!.skill!;
  assert.equal(skill.name, 'React Native', 'spaces tidied');
  assert.equal(skill.selfLevel, 'advanced');

  const list = await call(amina, 'GET', '/skills');
  assert.equal(list.body.data!.skills!.length, 1);
  assert.deepEqual(list.body.data!.counts, { total: 1, assessed: 0, selfReported: 1 });

  const edited = await call(amina, 'PATCH', `/skills/${skill.id}`, { yearsExp: 3, category: null });
  assert.equal(edited.body.data!.skill!.yearsExp, 3);
  assert.equal(edited.body.data!.skill!.category, null, 'cleared');

  assert.equal((await call(amina, 'DELETE', `/skills/${skill.id}`)).status, 204);
  assert.equal((await call(amina, 'GET', '/skills')).body.data!.skills!.length, 0);
  assert.equal((await call(null, 'GET', '/skills')).status, 401);
});

test('End Test: a duplicate skill for the same user is rejected (any letter case)', async () => {
  const first = await call(amina, 'POST', '/skills', { name: 'TypeScript', selfLevel: 'mid' });
  assert.equal(first.status, 201);
  const again = await call(amina, 'POST', '/skills', { name: ' typescript ', selfLevel: 'expert' });
  assert.equal(again.status, 409);
  assert.equal(again.body.error?.code, 'SKILL_EXISTS');
  assert.equal(again.body.error?.message, 'You already have this skill. Edit it instead');

  // Renaming another skill to the same name is refused too.
  const other = await call(amina, 'POST', '/skills', { name: 'JavaScript', selfLevel: 'mid' });
  const rename = await call(amina, 'PATCH', `/skills/${other.body.data!.skill!.id}`, {
    name: 'TYPESCRIPT',
  });
  assert.equal(rename.status, 409);

  // Two adds at the same moment: the database's unique index lets only one in.
  const both = await Promise.all([
    call(amina, 'POST', '/skills', { name: 'Docker', selfLevel: 'beginner' }),
    call(amina, 'POST', '/skills', { name: 'docker', selfLevel: 'mid' }),
  ]);
  assert.deepEqual(both.map((r) => r.status).sort(), [201, 409]);

  // Another user can have the same skill.
  assert.equal(
    (await call(omar, 'POST', '/skills', { name: 'TypeScript', selfLevel: 'beginner' })).status,
    201,
  );
});

test('End Test: changing selfLevel never changes assessedLevel, and the other way round', async () => {
  const added = await call(amina, 'POST', '/skills', { name: 'Node.js', selfLevel: 'beginner' });
  const id = added.body.data!.skill!.id;

  // An assessment (TIQ-13) records what a test showed; selfLevel stays as the user set it.
  const assessed = await recordAssessment(await userId('amina@skills.invalid'), id, {
    level: 'mid',
    gaps: ['Streams', 'Testing'],
  });
  assert.equal(assessed.selfLevel, 'beginner');
  assert.equal(assessed.assessedLevel, 'mid');
  assert.ok(assessed.lastAssessedAt);

  // The user changes selfLevel: assessedLevel, gaps and lastAssessedAt stay.
  const changed = await call(amina, 'PATCH', `/skills/${id}`, { selfLevel: 'expert' });
  const s = changed.body.data!.skill!;
  assert.equal(s.selfLevel, 'expert');
  assert.equal(s.assessedLevel, 'mid');
  assert.deepEqual(s.gaps, ['Streams', 'Testing']);

  // The user can never set assessedLevel (or gaps / lastAssessedAt) through the API.
  for (const body of [
    { assessedLevel: 'expert' },
    { gaps: [] },
    { lastAssessedAt: '2026-01-01' },
  ]) {
    const refused = await call(amina, 'PATCH', `/skills/${id}`, body);
    assert.equal(refused.status, 400);
    assert.equal(
      Object.values(refused.body.meta.details ?? {})[0],
      'This field cannot be changed here',
    );
  }
  const create = await call(amina, 'POST', '/skills', {
    name: 'Go',
    selfLevel: 'beginner',
    assessedLevel: 'expert',
  });
  assert.equal(create.status, 400);
  const stored = await Skill.findById(id);
  assert.equal(stored?.assessedLevel, 'mid');
  assert.equal(stored?.selfLevel, 'expert');
});

test('End Test: every answer carries both levels as separate fields', async () => {
  const added = await call(amina, 'POST', '/skills', { name: 'Python', selfLevel: 'mid' });
  const fresh = added.body.data!.skill!;
  assert.ok('selfLevel' in fresh && 'assessedLevel' in fresh);
  assert.equal(fresh.assessedLevel, null, 'not assessed yet: present, but null');

  const list = await call(amina, 'GET', '/skills');
  for (const skill of list.body.data!.skills!) {
    assert.ok('selfLevel' in skill, `${skill.name} has selfLevel`);
    assert.ok('assessedLevel' in skill, `${skill.name} has assessedLevel`);
  }
  const counts = list.body.data!.counts!;
  assert.equal(counts.assessed + counts.selfReported, counts.total);
  assert.ok(counts.assessed >= 1, 'Node.js was assessed above');
});

test('checks: required name and level, level values, years range', async () => {
  const missing = await call(amina, 'POST', '/skills', {});
  assert.deepEqual(Object.keys(missing.body.meta.details ?? {}).sort(), ['name', 'selfLevel']);
  const bad = await call(amina, 'POST', '/skills', {
    name: 'x'.repeat(61),
    selfLevel: 'guru',
    yearsExp: 99,
  });
  assert.deepEqual(bad.body.meta.details, {
    name: 'This text is too long',
    selfLevel: 'Choose one of the options',
    yearsExp: 'Enter a whole number in the allowed range',
  });
});

test("another user's skill is not found (404) and stays unchanged", async () => {
  const mine = await call(amina, 'POST', '/skills', { name: 'Private skill', selfLevel: 'mid' });
  const id = mine.body.data!.skill!.id;
  const omarList = await call(omar, 'GET', '/skills');
  assert.equal(JSON.stringify(omarList.body).includes('Private skill'), false);
  const edit = await call(omar, 'PATCH', `/skills/${id}`, { selfLevel: 'expert' });
  assert.equal(edit.status, 404);
  assert.equal(edit.body.error?.code, 'SKILL_NOT_FOUND');
  assert.equal((await call(omar, 'DELETE', `/skills/${id}`)).status, 404);
  assert.equal((await Skill.findById(id))?.selfLevel, 'mid');
  assert.equal((await call(amina, 'PATCH', '/skills/not-an-id', { selfLevel: 'mid' })).status, 404);
});

test('messages come in the user’s language (Somali)', async () => {
  const token = await account('hodan@skills.invalid');
  await call(token, 'PATCH', '/me', { preferredLanguage: 'so' });
  await call(token, 'POST', '/skills', { name: 'Excel', selfLevel: 'mid' });
  const again = await call(token, 'POST', '/skills', { name: 'excel', selfLevel: 'mid' });
  assert.equal(again.body.error?.message, 'Xirfaddan horay ayaad u haysataa. Wax ka beddel halkii');
});

test('deleting an account (admin) deletes its skills too', async () => {
  const email = 'gone@skills.invalid';
  const token = await account(email);
  await call(token, 'POST', '/skills', { name: 'SQL', selfLevel: 'mid' });
  const id = await userId(email);
  assert.equal(await Skill.countDocuments({ userId: id }), 1);

  await promoteToAdmin('omar@skills.invalid');
  const admin = await account('omar@skills.invalid');
  assert.equal((await call(admin, 'DELETE', `/admin/users/${id}`)).status, 204);
  assert.equal(await Skill.countDocuments({ userId: id }), 0);
});
