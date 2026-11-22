import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { RUN_ID } from './support/testRun.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { pushOutbox } from '../src/lib/push.js';
import { Announcement } from '../src/models/Announcement.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { Notification, PushToken } from '../src/models/Notification.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { User } from '../src/models/User.js';
import { migrateNotificationIndexes } from '../src/services/notificationService.js';
import { promoteToAdmin } from '../src/services/userService.js';

// TIQ-33 announcements. Own database per run (dropped at the end); fictional
// users; pushes go to the test outbox, never to Expo.
const DB_NAME = `kobaniq_test_announce_${RUN_ID}`;
const PASSWORD = 'correct-horse-5';

let server: Server;
let baseUrl: string;
let admin: string;
const users: Record<string, { id: string; token: string }> = {};

type Json = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads any answer
  data: any;
  error: { code: string } | null;
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
  return { status: res.status, body: (await res.json().catch(() => null)) as Json };
}

async function account(email: string, isAdmin = false) {
  await call(null, 'POST', '/auth/register', { email, password: PASSWORD, ageConfirmed: true });
  if (isAdmin) await promoteToAdmin(email);
  const { body } = await call(null, 'POST', '/auth/login', { email, password: PASSWORD });
  return { id: body.data.user.id as string, token: body.data.accessToken as string };
}

const MESSAGE = {
  title: { en: 'New job sources', so: 'Ilo shaqo oo cusub' },
  body: {
    en: 'KOBANIQ now searches more career pages.',
    so: 'KOBANIQ hadda wuxuu raadiyaa bogag shaqaalaysiin oo badan.',
  },
};

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all(
    [User, RefreshToken, Notification, PushToken, Announcement, AuditLog].map((m) =>
      m.syncIndexes(),
    ),
  );
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  admin = (await account('boss@announce.invalid', true)).token;
  users.amina = await account('amina@announce.invalid'); // English, push on
  users.omar = await account('omar@announce.invalid'); // Somali, push on
  users.hodan = await account('hodan@announce.invalid'); // Somali, push off
  users.gone = await account('gone@announce.invalid'); // suspended
  await User.updateOne({ _id: users.omar.id }, { preferredLanguage: 'so' });
  await User.updateOne({ _id: users.hodan.id }, { preferredLanguage: 'so', notifyPush: false });
  await User.updateOne({ _id: users.gone.id }, { status: 'suspended' });
  for (const [name, n] of [
    ['amina', 1],
    ['omar', 2],
    ['hodan', 3],
    ['gone', 4],
  ] as const) {
    await PushToken.create({
      userId: users[name].id,
      token: `ExponentPushToken[announce-${n}]`,
      platform: 'ios',
    });
  }
});

beforeEach(() => {
  pushOutbox.length = 0;
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('End Test: an announcement reaches users in their chosen language', async () => {
  const counts = await call(admin, 'GET', '/admin/announcements/audience');
  // Active users: the admin, Amina (en), Omar and Hodan (so); the suspended user is left out.
  assert.deepEqual(counts.body.data.counts, { all: 4, en: 2, so: 2 });

  const sent = await call(admin, 'POST', '/admin/announcements', {
    ...MESSAGE,
    audience: 'all',
    push: true,
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.equal(sent.body.data.announcement.recipients, 4);

  // Pushes: each phone in its owner's language; Hodan (push off) and the suspended user get none.
  const byToken = Object.fromEntries(pushOutbox.map((m) => [m.to, m]));
  assert.equal(byToken['ExponentPushToken[announce-1]'].title, MESSAGE.title.en);
  assert.equal(byToken['ExponentPushToken[announce-1]'].body, MESSAGE.body.en);
  assert.equal(byToken['ExponentPushToken[announce-2]'].title, MESSAGE.title.so);
  assert.equal(byToken['ExponentPushToken[announce-2]'].body, MESSAGE.body.so);
  assert.equal(byToken['ExponentPushToken[announce-3]'], undefined, 'push off is respected');
  assert.equal(byToken['ExponentPushToken[announce-4]'], undefined, 'suspended users get nothing');
  assert.equal(byToken['ExponentPushToken[announce-2]'].data?.type, 'announcement');

  // In-app: one item each with both languages (the app shows its own language).
  const omar = await call(users.omar.token, 'GET', '/notifications');
  assert.equal(omar.body.data.unread, 1);
  const item = omar.body.data.notifications[0];
  assert.equal(item.type, 'announcement');
  assert.equal(item.jobId, null);
  assert.deepEqual(item.message, MESSAGE);
  assert.equal(pushOutbox[0].data?.notificationId !== '', true);
  const hodan = await call(users.hodan.token, 'GET', '/notifications');
  assert.equal(hodan.body.data.notifications.length, 1, 'push off still gets the in-app item');
  assert.equal(await Notification.countDocuments({ userId: users.gone.id }), 0);

  // The admin sees who got it and, once read, how many read it.
  await call(users.omar.token, 'POST', `/notifications/${item.id}/read`);
  const list = await call(admin, 'GET', '/admin/announcements');
  const row = list.body.data.items[0];
  assert.equal(row.recipients, 4);
  assert.equal(row.pushed, 2);
  assert.equal(row.read, 1);
  assert.equal(row.createdBy, 'boss@announce.invalid');

  const audit = await AuditLog.findOne({ action: 'announcement.send' }).lean();
  assert.equal(audit?.targetId, row.id);
  assert.deepEqual(audit?.after, {
    title: MESSAGE.title.en,
    audience: 'all',
    push: true,
    recipients: 4,
  });
});

test('a second announcement to Somali users only, without push', async () => {
  const sent = await call(admin, 'POST', '/admin/announcements', {
    title: { en: 'Maintenance tonight', so: 'Dayactir caawa' },
    body: { en: 'The app may be slow for an hour.', so: 'App-ku wuu gaabin karaa saacad.' },
    audience: 'so',
    push: false,
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.data.announcement.recipients, 2);
  assert.equal(pushOutbox.length, 0, 'no push asked');
  // Omar now has two announcements (the old unique index would have refused this).
  const omar = await call(users.omar.token, 'GET', '/notifications');
  assert.equal(omar.body.data.notifications.length, 2);
  const amina = await call(users.amina.token, 'GET', '/notifications');
  assert.equal(amina.body.data.notifications.length, 1, 'English users are not in this audience');
});

test('both languages are required, with length limits; only admins may send', async () => {
  const bad = await call(admin, 'POST', '/admin/announcements', {
    title: { en: 'Only English', so: '' },
    body: { en: 'x'.repeat(501), so: 'Qoraal' },
    audience: 'everyone',
    push: 'yes',
  });
  assert.equal(bad.status, 400);
  // Each field with its (translated) reason.
  assert.deepEqual(Object.keys(bad.body.meta.details ?? {}).sort(), [
    'audience',
    'bodyEn',
    'push',
    'titleSo',
  ]);
  assert.equal(await Announcement.countDocuments(), 2, 'nothing was sent');

  const nosy = await call(users.amina.token, 'POST', '/admin/announcements', {
    ...MESSAGE,
    audience: 'all',
    push: false,
  });
  assert.equal(nosy.status, 403);
  assert.equal((await call(users.amina.token, 'GET', '/admin/announcements')).status, 403);
});

test('start-up replaces the old notifications index (safe to repeat)', async () => {
  // Before the first announcement (the real situation): the old plain index is there.
  await Notification.deleteMany({});
  await Notification.collection.dropIndex('one_alert_per_job');
  await Notification.collection.createIndex(
    { userId: 1, type: 1, jobId: 1 },
    { unique: true, name: 'userId_1_type_1_jobId_1' },
  );
  await migrateNotificationIndexes();
  await migrateNotificationIndexes();
  const names = (await Notification.collection.indexes()).map((i) => i.name);
  assert.ok(!names.includes('userId_1_type_1_jobId_1'), 'old index dropped');
  assert.ok(names.includes('one_alert_per_job'));
  assert.ok(names.includes('one_item_per_announcement'));
});
