import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { outbox } from '../src/lib/mailer.js';
import { sendToExpo, type PushMessage } from '../src/lib/push.js';
import { PushToken } from '../src/models/Notification.js';
import { PushTicket } from '../src/models/PushTicket.js';
import { resetAlertsForTests } from '../src/services/alertService.js';
import { RECEIPT_DELAY_MS, checkPushReceipts } from '../src/services/pushReceiptService.js';
import { RUN_ID } from './support/testRun.js';

/**
 * Firebase / FCM setup: push tickets are kept and their receipts checked about
 * 15 minutes later. Expo is replaced by a fake; nothing leaves the machine.
 */
const DB_NAME = `kobaniq_test_pushreceipts_${RUN_ID}`;
const TEAM = 'team@pushreceipts.test.kobaniq.invalid';
const savedAlertEmail = env.alertEmail;

const token = (n: number) => `ExponentPushToken[smoke-${RUN_ID}-${n}xxxx]`;
const message = (to: string): PushMessage => ({
  to,
  title: 'Private title',
  body: 'Private body text',
  data: { type: 'announcement' },
});

/** A fake Expo answering with the given JSON; records every request body. */
function fakeExpo(answers: unknown[]) {
  const bodies: unknown[] = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const next = answers.shift();
    return new Response(JSON.stringify(next), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, bodies };
}

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await Promise.all([PushTicket.syncIndexes(), PushToken.syncIndexes()]);
});

beforeEach(async () => {
  env.alertEmail = TEAM;
  resetAlertsForTests();
  outbox.length = 0;
  await Promise.all([PushTicket.deleteMany({}), PushToken.deleteMany({})]);
});

after(async () => {
  env.alertEmail = savedAlertEmail;
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('accepted pushes keep a ticket (id and token only); a gone phone is reported at once', async () => {
  const expo = fakeExpo([
    {
      data: [
        { status: 'ok', id: 'ticket-1' },
        { status: 'error', details: { error: 'DeviceNotRegistered' } },
      ],
    },
  ]);
  const result = await sendToExpo([message(token(1)), message(token(2))], expo.fetchImpl);
  assert.deepEqual(result.invalidTokens, [token(2)]);

  const tickets = await PushTicket.find().lean();
  assert.equal(tickets.length, 1);
  assert.equal(tickets[0].ticketId, 'ticket-1');
  assert.equal(tickets[0].token, token(1));
  const stored = JSON.stringify(tickets);
  assert.equal(stored.includes('Private'), false, 'no message text is kept');
});

test('wrong Firebase credentials in a ticket send one alert to the team', async () => {
  const expo = fakeExpo([
    { data: [{ status: 'error', details: { error: 'InvalidCredentials' } }] },
    { data: [{ status: 'error', details: { error: 'InvalidCredentials' } }] },
  ]);
  await sendToExpo([message(token(1))], expo.fetchImpl);
  await sendToExpo([message(token(1))], expo.fetchImpl);
  await new Promise((r) => setTimeout(r, 20));
  const alerts = outbox.filter((m) => m.to === TEAM);
  assert.equal(alerts.length, 1, 'throttled to one email');
  assert.match(alerts[0].subject, /Push notifications are failing: InvalidCredentials/);
});

test('receipts are checked only after 15 minutes', async () => {
  await PushTicket.create({ ticketId: 'fresh', token: token(1) });
  const expo = fakeExpo([]);
  const result = await checkPushReceipts({ fetchImpl: expo.fetchImpl });
  assert.equal(result.checked, 0);
  assert.equal(expo.bodies.length, 0, 'Expo is not asked yet');
});

test('receipts: gone phones are forgotten, setup errors alert, unready ones wait', async () => {
  await PushToken.create([
    { userId: new mongoose.Types.ObjectId(), token: token(1), platform: 'android' },
    { userId: new mongoose.Types.ObjectId(), token: token(2), platform: 'android' },
    { userId: new mongoose.Types.ObjectId(), token: token(3), platform: 'ios' },
  ]);
  await PushTicket.create([
    { ticketId: 't-ok', token: token(1) },
    { ticketId: 't-gone', token: token(2) },
    { ticketId: 't-creds', token: token(3) },
    { ticketId: 't-later', token: token(3) },
  ]);
  const expo = fakeExpo([
    {
      data: {
        't-ok': { status: 'ok' },
        't-gone': { status: 'error', details: { error: 'DeviceNotRegistered' } },
        't-creds': { status: 'error', details: { error: 'MismatchSenderId' } },
      },
    },
  ]);
  const result = await checkPushReceipts({
    fetchImpl: expo.fetchImpl,
    now: () => Date.now() + RECEIPT_DELAY_MS + 1000,
  });
  assert.deepEqual(result, { checked: 3, forgottenTokens: 1, setupErrors: 1 });
  assert.deepEqual((expo.bodies[0] as { ids: string[] }).ids.sort(), [
    't-creds',
    't-gone',
    't-later',
    't-ok',
  ]);
  assert.equal(await PushToken.exists({ token: token(2) }), null, 'gone phone forgotten');
  assert.ok(await PushToken.exists({ token: token(1) }), 'working phone kept');
  const left = (await PushTicket.find().lean()).map((t) => t.ticketId);
  assert.deepEqual(left, ['t-later'], 'only the unanswered ticket waits');
  await new Promise((r) => setTimeout(r, 20));
  assert.match(outbox.filter((m) => m.to === TEAM)[0]?.subject ?? '', /MismatchSenderId/);
});

test('an Expo outage during the check keeps every ticket for the next try', async () => {
  await PushTicket.create({ ticketId: 't-1', token: token(1) });
  const fetchImpl = (async () => new Response('down', { status: 503 })) as typeof fetch;
  await assert.rejects(
    checkPushReceipts({ fetchImpl, now: () => Date.now() + RECEIPT_DELAY_MS + 1000 }),
    /503/,
  );
  assert.equal(await PushTicket.countDocuments(), 1);
});
