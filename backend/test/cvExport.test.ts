import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Cv } from '../src/models/Cv.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import type { AssembledCv } from '../src/services/cvFacts.js';
import { buildCvPdf } from '../src/services/cvPdf.js';
import { RUN_ID } from './support/testRun.js';

// TIQ-10: approve, edit the wording (versions), PDF export. Own database per run;
// fictional data only. CVs are stored directly (no AI needed for these tests).
const DB_NAME = `kobaniq_test_cvexport_${RUN_ID}`;
const PASSWORD = 'correct-horse-10';

let server: Server;
let baseUrl: string;
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
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/pdf')) {
    return { status: res.status, headers: res.headers, pdf: Buffer.from(await res.arrayBuffer()) };
  }
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: (text ? JSON.parse(text) : {}) as Json };
}

async function account(email: string) {
  await call(null, 'POST', '/auth/register', { email, password: PASSWORD, ageConfirmed: true });
  return (await call(null, 'POST', '/auth/login', { email, password: PASSWORD })).body.data
    .accessToken as string;
}

const CONTENT = (language: 'en' | 'so'): AssembledCv => ({
  language,
  header: {
    fullName: 'Amina Testcase',
    headline: 'Data clerk',
    city: 'Hargeisa',
    region: 'somaliland',
    email: 'amina.cv@example.com',
    phone: '+252 63 000 0001',
  },
  summary: 'Data clerk with 3 years of Excel.',
  skills: [{ name: 'Excel', level: 'mid', assessed: true }],
  experience: [
    {
      id: 'e1',
      title: 'Data clerk',
      employer: 'Example Clinic',
      city: 'Hargeisa',
      startDate: '2022-03',
      endDate: null,
      bullets: ['Entered survey forms.'],
    },
  ],
  education: [
    {
      id: 'ed1',
      school: 'Example University',
      degree: 'BSc',
      field: 'Statistics',
      startYear: 2018,
      endYear: 2021,
    },
  ],
  projects: [{ id: 'p1', name: 'Clinic dashboard', url: null, bullets: ['Built a sheet.'] }],
  certifications: [],
  languages: [{ id: 'l1', language: 'Somali', level: 'native' }],
});

async function storedCv(language: 'en' | 'so' = 'en', status = 'draft') {
  const cv = await Cv.create({
    userId: aminaId,
    jobDescriptionId: new mongoose.Types.ObjectId(),
    language,
    version: 1,
    status,
    content: CONTENT(language),
    missingInfo: [{ type: 'requiredSkill', item: 'SQL' }],
  });
  return String(cv._id);
}

/** Standard PDF fonts use WinAnsi (Windows-1252), e.g. 0x96 = "–". */
const WIN_ANSI = new TextDecoder('windows-1252');

/** The text in an uncompressed pdfkit PDF: each TJ array's hex pieces joined. */
function pdfText(pdf: Buffer) {
  const source = pdf.toString('latin1');
  return (source.match(/\[[^\]]*\] TJ/g) ?? [])
    .map((tj) =>
      (tj.match(/<([0-9a-f]*)>/gi) ?? [])
        .map((hex) => WIN_ANSI.decode(Buffer.from(hex.slice(1, -1), 'hex')))
        .join(''),
    )
    .join('\n');
}

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all([User, RefreshToken, Cv].map((m) => m.syncIndexes()));
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  amina = await account('amina@cvexport.invalid');
  other = await account('hodan@cvexport.invalid');
  aminaId = (await User.findOne({ email: 'amina@cvexport.invalid' }))!._id;
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('End Test: the PDF is refused while the CV is a draft', async () => {
  const id = await storedCv();
  const res = await call(amina, 'GET', `/cvs/${id}/pdf`);
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'CV_NOT_APPROVED');
  assert.equal(res.body.error.message, 'Approve the CV before downloading it as a PDF');
  assert.equal((await Cv.findById(id))?.status, 'draft');
});

test('End Test: approve → PDF downloads, is a real PDF and is marked exported', async () => {
  const id = await storedCv();
  const approved = await call(amina, 'POST', `/cvs/${id}/approve`);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.cv.status, 'approved');
  assert.ok(approved.body.data.cv.approvedAt);

  const res = await call(amina, 'GET', `/cvs/${id}/pdf`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.match(res.headers.get('content-disposition') ?? '', /CV-Amina-Testcase-en-v1\.pdf/);
  assert.equal(res.pdf!.subarray(0, 5).toString(), '%PDF-');
  assert.ok(res.pdf!.subarray(-8).toString().includes('%%EOF'));

  const cv = (await call(amina, 'GET', `/cvs/${id}`)).body.data.cv;
  assert.equal(cv.status, 'exported');
  assert.ok(cv.exportedAt);
  // Downloading again works and keeps it exported.
  assert.equal((await call(amina, 'GET', `/cvs/${id}/pdf`)).status, 200);
  assert.equal((await call(amina, 'POST', `/cvs/${id}/approve`)).body.data.cv.status, 'exported');
});

test('End Test: the PDF holds exactly what the preview shows, headings in the CV language', async () => {
  const en = pdfText(await buildCvPdf(CONTENT('en'), { compress: false }));
  for (const expected of [
    'Amina Testcase',
    'Data clerk',
    'amina.cv@example.com',
    'Data clerk with 3 years of Excel.',
    'Data clerk · Example Clinic',
    '2022-03 – present',
    'Entered survey forms.',
    'Example University',
    'BSc · Statistics · 2018–2021',
    'Excel (Mid, assessed)',
    'Clinic dashboard',
    'Somali (Native)',
    'EXPERIENCE',
    'EDUCATION',
  ]) {
    assert.ok(en.includes(expected), `English PDF has "${expected}"`);
  }

  const so = pdfText(await buildCvPdf(CONTENT('so'), { compress: false }));
  for (const expected of ['KHIBRAD SHAQO', 'WAXBARASHO', '2022-03 – hadda', 'la qiimeeyay']) {
    assert.ok(so.includes(expected), `Somali PDF has "${expected}"`);
  }
  assert.equal(so.includes('EXPERIENCE'), false, 'no English headings in a Somali CV');
});

test('editing a draft changes the wording in place; facts cannot be edited', async () => {
  const id = await storedCv();
  const res = await call(amina, 'PATCH', `/cvs/${id}`, {
    headline: '  Junior data officer  ',
    summary: 'Careful data clerk.',
    experience: [{ id: 'e1', bullets: ['Checked 500 survey forms each month.'] }],
  });
  assert.equal(res.status, 200);
  const cv = res.body.data.cv;
  assert.equal(cv.id, id, 'same CV');
  assert.equal(cv.version, 1);
  assert.equal(cv.content.header.headline, 'Junior data officer');
  assert.equal(cv.content.summary, 'Careful data clerk.');
  assert.deepEqual(cv.content.experience[0].bullets, ['Checked 500 survey forms each month.']);
  assert.equal(cv.content.experience[0].employer, 'Example Clinic', 'facts unchanged');
  assert.deepEqual(cv.content.projects[0].bullets, ['Built a sheet.'], 'untouched entries stay');

  for (const [body, field] of [
    [{ employer: 'Invented Ltd' }, 'employer'],
    [{ experience: [{ id: 'e1', bullets: ['x'], employer: 'Invented Ltd' }] }, 'experience'],
    [{ experience: [{ id: 'not-in-cv', bullets: ['x'] }] }, 'experience'],
    [{ experience: [{ id: 'e1', bullets: ['1', '2', '3', '4', '5', '6', '7'] }] }, 'experience'],
    [{ projects: [{ id: 'p1', bullets: ['a', 'b', 'c', 'd', 'e'] }] }, 'projects'],
    [{ summary: '' }, 'summary'],
    [{ headline: 'x'.repeat(121) }, 'headline'],
    [{}, 'body'],
  ] as const) {
    const bad = await call(amina, 'PATCH', `/cvs/${id}`, body);
    assert.equal(bad.status, 400, JSON.stringify(body));
    assert.ok(bad.body.meta.details[field], `${JSON.stringify(body)} → ${field}`);
  }
  assert.equal((await Cv.findById(id).lean())?.content.experience[0].employer, 'Example Clinic');
});

test('editing an approved CV makes a new draft version and keeps the approved one', async () => {
  const id = await storedCv('so');
  await call(amina, 'POST', `/cvs/${id}/approve`);
  const res = await call(amina, 'PATCH', `/cvs/${id}`, { summary: 'Qoraal cusub.' });
  assert.equal(res.status, 200);
  const copy = res.body.data.cv;
  assert.notEqual(copy.id, id);
  assert.equal(copy.version, 2);
  assert.equal(copy.status, 'draft');
  assert.equal(copy.language, 'so');
  assert.equal(copy.content.summary, 'Qoraal cusub.');
  assert.deepEqual(copy.missingInfo, [{ type: 'requiredSkill', item: 'SQL' }]);

  const kept = (await call(amina, 'GET', `/cvs/${id}`)).body.data.cv;
  assert.equal(kept.status, 'approved');
  assert.equal(kept.content.summary, 'Data clerk with 3 years of Excel.');
  // The new draft must be approved before its PDF.
  assert.equal((await call(amina, 'GET', `/cvs/${copy.id}/pdf`)).status, 409);
});

test("another user's CV: not found for every action; signed out: 401", async () => {
  const id = await storedCv();
  for (const [method, path, body] of [
    ['GET', `/cvs/${id}`, undefined],
    ['PATCH', `/cvs/${id}`, { summary: 'Hacked.' }],
    ['POST', `/cvs/${id}/approve`, undefined],
    ['GET', `/cvs/${id}/pdf`, undefined],
  ] as const) {
    const res = await call(other, method, path, body);
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.equal(res.body.error.code, 'CV_NOT_FOUND');
  }
  assert.equal((await call(null, 'GET', `/cvs/${id}/pdf`)).status, 401);
  const cv = await Cv.findById(id).lean();
  assert.equal(cv?.status, 'draft');
  assert.equal(cv?.content.summary, 'Data clerk with 3 years of Excel.');
});
