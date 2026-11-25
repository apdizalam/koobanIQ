import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import mongoose from 'mongoose';
import { runAi, setAiProviderForTests } from '../src/ai/aiService.js';
import { createMockProvider } from '../src/ai/mock.js';
import { connectivityCheckPrompt } from '../src/ai/prompts/connectivityCheck.js';
import { AiProviderError } from '../src/ai/provider.js';
import { connectivityCheckSchema } from '../src/ai/schemas/connectivityCheck.js';
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { outbox } from '../src/lib/mailer.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import {
  AI_OUTAGE_FAILURES,
  noteAiFailure,
  resetAlertsForTests,
  scrub,
  sendAlert,
} from '../src/services/alertService.js';
import { RUN_ID } from './support/testRun.js';

/** TIQ-25: error alerts by email. In tests the mailer keeps emails in `outbox`. */
const DB_NAME = `kobaniq_test_alerts_${RUN_ID}`;
const TEAM = 'team@alerts.test.kobaniq.invalid';
const saved = { email: env.alertEmail, cooldown: env.alertCooldownMs, retry: env.aiRetryDelayMs };
let server: Server;
let baseUrl: string;

const alertsSent = () => outbox.filter((m) => m.to === TEAM);

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  const app = express();
  app.get('/boom', () => {
    throw new Error('E11000 duplicate key { email: "someone@example.com" } id 1234567890');
  });
  app.get('/expected', (_req, _res, next) => {
    next(Object.assign(new SyntaxError('bad json'), { body: '{' }));
  });
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  env.alertEmail = TEAM;
  env.alertCooldownMs = 15 * 60_000;
  env.aiRetryDelayMs = 5;
  resetAlertsForTests();
  outbox.length = 0;
});

after(async () => {
  env.alertEmail = saved.email;
  env.alertCooldownMs = saved.cooldown;
  env.aiRetryDelayMs = saved.retry;
  setAiProviderForTests(undefined);
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('no ALERT_EMAIL: alerts are off and nothing is sent', async () => {
  env.alertEmail = '';
  assert.equal(await sendAlert({ kind: 'test', title: 'x' }), 'off');
  assert.equal(outbox.length, 0);
});

test('an alert email names the environment and problem, and holds no personal data', async () => {
  assert.equal(
    await sendAlert({
      kind: 'test',
      title: 'Test alert',
      lines: ['user amina@example.com, token Bearer abc.def, phone 252634567890'],
    }),
    'sent',
  );
  const [mail] = alertsSent();
  assert.match(mail.subject, /\[KOBANIQ test\] Test alert/);
  assert.match(mail.text, /\[email\]/);
  assert.match(mail.text, /Bearer \[token\]/);
  assert.match(mail.text, /\[number\]/);
  assert.equal(mail.text.includes('amina@example.com'), false);
  assert.equal(mail.text.includes('252634567890'), false);
});

test('one email per kind of problem per cooldown; the next one counts what was held back', async () => {
  let now = 1_000_000;
  const deps = { now: () => now };
  assert.equal(await sendAlert({ kind: 'server_error', key: 'Error', title: 'A' }, deps), 'sent');
  assert.equal(
    await sendAlert({ kind: 'server_error', key: 'Error', title: 'A' }, deps),
    'throttled',
  );
  assert.equal(
    await sendAlert({ kind: 'server_error', key: 'Error', title: 'A' }, deps),
    'throttled',
  );
  // A different problem is not held back by the first one.
  assert.equal(
    await sendAlert({ kind: 'server_error', key: 'TypeError', title: 'B' }, deps),
    'sent',
  );
  now += 15 * 60_000;
  assert.equal(await sendAlert({ kind: 'server_error', key: 'Error', title: 'A' }, deps), 'sent');
  assert.equal(alertsSent().length, 3);
  assert.match(alertsSent()[2].text, /2 more time\(s\)/);
});

test('a failed email never breaks anything: it is reported as failed', async () => {
  const result = await sendAlert(
    { kind: 'test', title: 'x' },
    {
      send: async () => {
        throw new Error('Resend down');
      },
    },
  );
  assert.equal(result, 'failed');
});

test('scrub removes emails, long values and long numbers, and cuts long text', () => {
  assert.equal(scrub('to a.b@c.org now'), 'to [email] now');
  assert.equal(scrub('k=' + 'x'.repeat(40)), 'k=[long value]');
  assert.equal(scrub('id 1234567'), 'id [number]');
  assert.equal(scrub('word '.repeat(100)).length, 300);
});

test('a server error (500) sends an alert with the route; expected errors do not', async () => {
  const res = await fetch(`${baseUrl}/boom`);
  assert.equal(res.status, 500);
  await new Promise((r) => setTimeout(r, 20));
  const [mail] = alertsSent();
  assert.match(mail.subject, /Server error \(500\) on GET \/boom/);
  assert.match(mail.text, /E11000 duplicate key/);
  assert.equal(mail.text.includes('someone@example.com'), false, 'no email address');
  assert.equal(mail.text.includes('1234567890'), false, 'no long number');

  outbox.length = 0;
  assert.equal((await fetch(`${baseUrl}/expected`)).status, 400);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(alertsSent().length, 0, 'client mistakes are not alerts');
});

test(`AI outage: one email once ${AI_OUTAGE_FAILURES} AI requests failed within 15 minutes`, async () => {
  const mock = createMockProvider();
  setAiProviderForTests(mock.provider);
  const task = {
    feature: 'connectivity_check' as const,
    prompt: connectivityCheckPrompt('en'),
    schema: connectivityCheckSchema,
  };
  for (let i = 1; i <= AI_OUTAGE_FAILURES + 1; i += 1) {
    mock.reply(
      { error: new AiProviderError('unavailable', 'down', 503) },
      { error: new AiProviderError('unavailable', 'down', 503) },
      { error: new AiProviderError('unavailable', 'down', 503) },
    );
    await assert.rejects(runAi({ ...task, userId: new mongoose.Types.ObjectId() }));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(alertsSent().length, i < AI_OUTAGE_FAILURES ? 0 : 1, `after ${i} failures`);
  }
  const [mail] = alertsSent();
  assert.match(mail.subject, /AI outage/);
  assert.match(mail.text, /AI_UNAVAILABLE × 5/);
});

test('old AI failures drop out of the 15-minute window', async () => {
  let now = 0;
  const deps = { now: () => now };
  for (let i = 0; i < AI_OUTAGE_FAILURES - 1; i += 1)
    await noteAiFailure('skill_quiz', 'AI_TIMEOUT', deps);
  now += 16 * 60_000;
  assert.equal(await noteAiFailure('skill_quiz', 'AI_TIMEOUT', deps), 'off');
  assert.equal(alertsSent().length, 0);
});
