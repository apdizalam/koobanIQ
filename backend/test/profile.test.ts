import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Profile } from '../src/models/Profile.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import { promoteToAdmin } from '../src/services/userService.js';

// Own database per run (dropped at the end). Every person here is a clearly fake test user.
const DB_NAME = `kobaniq_test_profile_${RUN_ID}`;
const PASSWORD = 'correct-horse-6';

let server: Server;
let baseUrl: string;
let amina: string;
let omar: string;

type Body = {
  data: { profile: Profile } | null;
  error: { code: string; message: string } | null;
  meta: { details?: Record<string, string> };
};
type Item = { id: string } & Record<string, unknown>;
type Profile = {
  personal: Record<string, unknown>;
  experience: Item[];
  education: Item[];
  projects: Item[];
  certifications: Item[];
  languages: Item[];
  preferences: Record<string, string[]>;
  completion: number;
};

async function call(
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  // 204 (no content) has no body.
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Body };
}

async function account(email: string) {
  await call(null, 'POST', '/auth/register', { email, password: PASSWORD });
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return ((await res.json()) as { data: { accessToken: string } }).data.accessToken;
}

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([
    User.syncIndexes(),
    RefreshToken.syncIndexes(),
    Profile.syncIndexes(),
    AuditLog.syncIndexes(),
  ]);
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  amina = await account('amina@profile.invalid');
  omar = await account('omar@profile.invalid');
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('a new user gets an empty profile (0% complete); signed-out requests get 401', async () => {
  const res = await call(amina, 'GET', '/profile');
  assert.equal(res.status, 200);
  const p = res.body.data!.profile;
  assert.deepEqual(p.personal, {});
  assert.deepEqual(p.experience, []);
  assert.deepEqual(p.preferences.regions, []);
  assert.equal(p.completion, 0);
  assert.equal((await call(null, 'GET', '/profile')).status, 401);
});

test('personal info: set, change and clear fields; bad values are refused per field', async () => {
  let res = await call(amina, 'PATCH', '/profile/personal', {
    fullName: '  Amina Test  ',
    headline: 'Junior QA tester',
    region: 'somaliland',
    city: 'Hargeisa',
    phone: '+252 63 000 0000',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data!.profile.personal.fullName, 'Amina Test', 'trimmed');
  assert.equal(res.body.data!.profile.personal.region, 'somaliland');

  res = await call(amina, 'PATCH', '/profile/personal', {
    phone: null,
    summary: 'Careful tester.',
  });
  assert.equal(res.body.data!.profile.personal.phone, undefined, 'cleared');
  assert.equal(res.body.data!.profile.personal.headline, 'Junior QA tester', 'untouched');

  const bad = await call(amina, 'PATCH', '/profile/personal', {
    fullName: 'x'.repeat(101),
    region: 'kenya',
    phone: 'call me',
    role: 'admin',
  });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.meta.details, {
    fullName: 'This text is too long',
    region: 'Choose one of the options',
    phone: 'Enter a valid phone number',
    role: 'This field cannot be changed here',
  });
  const empty = await call(amina, 'PATCH', '/profile/personal', {});
  assert.equal(empty.status, 400);
});

test('End Test: create, read, update and delete work in every list section', async () => {
  const samples: Record<string, { create: object; update: object; check: [string, unknown] }> = {
    experience: {
      create: {
        title: 'QA intern',
        employer: 'Test company',
        startDate: '2024-01',
        endDate: '2024-06',
      },
      update: { endDate: null, description: 'Manual testing' },
      check: ['description', 'Manual testing'],
    },
    education: {
      create: { school: 'Test university', degree: 'BSc', startYear: 2019, endYear: 2023 },
      update: { field: 'Computer science' },
      check: ['field', 'Computer science'],
    },
    projects: {
      create: {
        name: 'Test app',
        url: 'https://example.invalid/app',
        skills: ['React', 'react', 'Jest'],
      },
      update: { description: 'A small app' },
      check: ['description', 'A small app'],
    },
    certifications: {
      create: { name: 'Test certificate', issuer: 'Test board', issuedOn: '2025-03' },
      update: { issuer: 'Other board' },
      check: ['issuer', 'Other board'],
    },
    languages: {
      create: { language: 'Somali', level: 'native' },
      update: { level: 'fluent' },
      check: ['level', 'fluent'],
    },
  };

  for (const [section, sample] of Object.entries(samples)) {
    const created = await call(amina, 'POST', `/profile/${section}`, sample.create);
    assert.equal(created.status, 201, `${section} create`);
    const list = created.body.data!.profile[section as 'experience'];
    const added = list.at(-1)!;
    assert.match(added.id, /^[a-f\d]{24}$/);

    const read = await call(amina, 'GET', '/profile');
    assert.ok(read.body.data!.profile[section as 'experience'].some((i) => i.id === added.id));

    const updated = await call(amina, 'PATCH', `/profile/${section}/${added.id}`, sample.update);
    assert.equal(updated.status, 200, `${section} update`);
    const after = updated.body.data!.profile[section as 'experience'].find(
      (i) => i.id === added.id,
    )!;
    assert.equal(after[sample.check[0]], sample.check[1]);

    const removed = await call(amina, 'DELETE', `/profile/${section}/${added.id}`);
    assert.equal(removed.status, 200, `${section} delete`);
    assert.equal(
      removed.body.data!.profile[section as 'experience'].some((i) => i.id === added.id),
      false,
    );
  }

  // Lists are de-duplicated; "endDate: null" made the job current.
  const project = await call(amina, 'POST', '/profile/projects', {
    name: 'Dedupe',
    skills: ['A', 'a'],
  });
  assert.deepEqual(project.body.data!.profile.projects.at(-1)!.skills, ['A']);
});

test('list items: required fields, formats and date order are checked', async () => {
  const missing = await call(amina, 'POST', '/profile/experience', { title: 'Tester' });
  assert.equal(missing.status, 400);
  assert.deepEqual(Object.keys(missing.body.meta.details ?? {}).sort(), ['employer', 'startDate']);

  const formats = await call(amina, 'POST', '/profile/experience', {
    title: 'Tester',
    employer: 'Test company',
    startDate: '2024/01',
  });
  assert.equal(formats.body.meta.details?.startDate, 'Use year and month, for example 2024-09');

  const order = await call(amina, 'POST', '/profile/experience', {
    title: 'Tester',
    employer: 'Test company',
    startDate: '2024-05',
    endDate: '2024-01',
  });
  assert.equal(order.status, 400);
  assert.equal(order.body.meta.details?.endDate, 'The end cannot be before the start');

  const job = await call(amina, 'POST', '/profile/experience', {
    title: 'Tester',
    employer: 'Test company',
    startDate: '2024-05',
  });
  const id = job.body.data!.profile.experience.at(-1)!.id;
  // A change that would put the end before the existing start is refused too.
  const later = await call(amina, 'PATCH', `/profile/experience/${id}`, { endDate: '2023-01' });
  assert.equal(later.status, 400);
  const cleared = await call(amina, 'PATCH', `/profile/experience/${id}`, { title: '' });
  assert.equal(cleared.body.meta.details?.title, 'This field is required');

  const url = await call(amina, 'POST', '/profile/certifications', {
    name: 'Cert',
    url: 'javascript:alert(1)',
  });
  assert.equal(url.status, 400);
  const level = await call(amina, 'POST', '/profile/languages', {
    language: 'English',
    level: 'expert',
  });
  assert.equal(level.body.meta.details?.level, 'Choose one of the options');

  assert.equal((await call(amina, 'POST', '/profile/skills', { name: 'x' })).status, 404);
  assert.equal(
    (await call(amina, 'PATCH', '/profile/experience/not-an-id', { title: 'x' })).status,
    404,
  );
});

test('job preferences: replaced as lists, de-duplicated, values checked', async () => {
  const res = await call(amina, 'PUT', '/profile/preferences', {
    titles: ['QA tester', 'qa tester', 'Developer'],
    regions: ['somaliland', 'remote'],
    workModes: ['hybrid'],
    jobTypes: ['full_time', 'internship'],
    employerTypes: ['ngo', 'un_agency'],
  });
  assert.equal(res.status, 200);
  const prefs = res.body.data!.profile.preferences;
  assert.deepEqual(prefs.titles, ['QA tester', 'Developer']);
  assert.deepEqual(prefs.regions, ['somaliland', 'remote']);

  const bad = await call(amina, 'PUT', '/profile/preferences', {
    regions: ['kenya'],
    jobTypes: 'full_time',
  });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.meta.details ?? {}).sort(), ['jobTypes', 'regions']);

  const cleared = await call(amina, 'PUT', '/profile/preferences', { titles: [] });
  assert.deepEqual(cleared.body.data!.profile.preferences.titles, []);
  assert.deepEqual(cleared.body.data!.profile.preferences.regions, ['somaliland', 'remote']);
});

test('End Test (security): user B can never read or change user A’s profile', async () => {
  const a = await call(amina, 'POST', '/profile/experience', {
    title: 'Private job',
    employer: 'Private employer',
    startDate: '2022-02',
  });
  const itemId = a.body.data!.profile.experience.at(-1)!.id;

  // Omar's own profile never contains Amina's data.
  const omarView = await call(omar, 'GET', '/profile');
  assert.equal(JSON.stringify(omarView.body).includes('Private job'), false);
  assert.equal(omarView.body.data!.profile.experience.length, 0);

  // Using Amina's item id from Omar's account finds nothing (404) and changes nothing.
  const edit = await call(omar, 'PATCH', `/profile/experience/${itemId}`, { title: 'Hacked' });
  assert.equal(edit.status, 404);
  assert.equal(edit.body.error?.code, 'PROFILE_ITEM_NOT_FOUND');
  const del = await call(omar, 'DELETE', `/profile/experience/${itemId}`);
  assert.equal(del.status, 404);

  const aminaView = await call(amina, 'GET', '/profile');
  const job = aminaView.body.data!.profile.experience.find((i) => i.id === itemId);
  assert.equal(job?.title, 'Private job', 'unchanged');

  // A userId in the body is refused, not used.
  const sneaky = await call(omar, 'PATCH', '/profile/personal', { userId: 'x', fullName: 'Omar' });
  assert.equal(sneaky.status, 400);
  assert.equal(sneaky.body.meta.details?.userId, 'This field cannot be changed here');
});

test('completion reaches 100% when the five parts are filled', async () => {
  const token = await account('sara@profile.invalid');
  await call(token, 'PATCH', '/profile/personal', {
    fullName: 'Sara Test',
    headline: 'Data analyst',
    city: 'Garowe',
  });
  await call(token, 'POST', '/profile/experience', {
    title: 'Analyst',
    employer: 'Test NGO',
    startDate: '2021-01',
  });
  await call(token, 'POST', '/profile/education', { school: 'Test university' });
  const before = await call(token, 'POST', '/profile/languages', {
    language: 'English',
    level: 'fluent',
  });
  assert.equal(before.body.data!.profile.completion, 80);
  const done = await call(token, 'PUT', '/profile/preferences', { regions: ['somalia'] });
  assert.equal(done.body.data!.profile.completion, 100);
});

test('a section holds at most 50 items (409 with a clear message)', async () => {
  const token = await account('many@profile.invalid');
  // 49 items prepared directly (quicker), the 50th through the API.
  const user = await User.findOne({ email: 'many@profile.invalid' });
  await Profile.create({
    userId: user!._id,
    languages: Array.from({ length: 49 }, (_, i) => ({ language: `L${i}`, level: 'basic' })),
  });
  const last = await call(token, 'POST', '/profile/languages', { language: 'L49', level: 'basic' });
  assert.equal(last.status, 201);
  assert.equal(last.body.data!.profile.languages.length, 50);
  const full = await call(token, 'POST', '/profile/languages', {
    language: 'One more',
    level: 'basic',
  });
  assert.equal(full.status, 409);
  assert.equal(full.body.error?.code, 'PROFILE_SECTION_FULL');
});

test('field messages come in the user’s language (Somali)', async () => {
  const token = await account('hodan@profile.invalid');
  await call(token, 'PATCH', '/me', { preferredLanguage: 'so' });
  const res = await call(token, 'POST', '/profile/languages', { language: 'Arabic' });
  assert.equal(res.body.meta.details?.level, 'Goobtan waa qasab');
});

test('deleting an account (admin) deletes its profile too', async () => {
  const email = 'gone@profile.invalid';
  const token = await account(email);
  await call(token, 'PATCH', '/profile/personal', { fullName: 'Gone Test' });
  const user = await User.findOne({ email });
  assert.ok(await Profile.exists({ userId: user!._id }));

  await promoteToAdmin('amina@profile.invalid');
  const admin = await account('amina@profile.invalid').catch(() => amina);
  const res = await call(admin, 'DELETE', `/admin/users/${user!._id}`);
  assert.equal(res.status, 204);
  assert.equal(await Profile.exists({ userId: user!._id }), null);
});
