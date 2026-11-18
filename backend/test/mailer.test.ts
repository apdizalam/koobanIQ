import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMailer, outbox } from '../src/lib/mailer.js';

const message = { to: 'amina@example.com', subject: 'Code', text: 'Your code is 123456' };

test('test mode never sends: the email goes to the outbox', async () => {
  outbox.length = 0;
  const calls: unknown[] = [];
  const send = createMailer({
    nodeEnv: 'test',
    resendApiKey: 're_test_key',
    from: 'KOBANIQ <a@b.so>',
    fetchImpl: (async (...args: unknown[]) => {
      calls.push(args);
      return new Response(null, { status: 200 });
    }) as typeof fetch,
  });
  await send(message);
  assert.equal(calls.length, 0, 'no network call even with a key');
  assert.deepEqual(outbox, [message]);
});

test('with a key, the email is sent through the Resend API', async () => {
  let request: { url: string; init: RequestInit } | null = null;
  const send = createMailer({
    nodeEnv: 'production',
    resendApiKey: 're_live_key',
    from: 'KOBANIQ <no-reply@kobaniq.so>',
    fetchImpl: (async (url: string, init: RequestInit) => {
      request = { url, init };
      return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
    }) as typeof fetch,
  });
  await send(message);
  assert.ok(request);
  const { url, init } = request as { url: string; init: RequestInit };
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer re_live_key');
  assert.deepEqual(JSON.parse(init.body as string), {
    from: 'KOBANIQ <no-reply@kobaniq.so>',
    to: ['amina@example.com'],
    subject: 'Code',
    text: 'Your code is 123456',
  });
});

test('a Resend error is reported, not silently ignored', async () => {
  const send = createMailer({
    nodeEnv: 'production',
    resendApiKey: 're_live_key',
    from: 'KOBANIQ <no-reply@kobaniq.so>',
    fetchImpl: (async () =>
      new Response('{"message":"domain not verified"}', { status: 403 })) as typeof fetch,
  });
  await assert.rejects(send(message), /Resend rejected the email \(403\)/);
});

test('production without a key refuses to send instead of skipping', async () => {
  const send = createMailer({ nodeEnv: 'production', resendApiKey: '', from: 'x' });
  await assert.rejects(send(message), /RESEND_API_KEY is not set/);
});

test('development without a key prints the email instead of sending it', async () => {
  const printed: string[] = [];
  const original = console.log;
  console.log = (text: string) => printed.push(text);
  try {
    await createMailer({ nodeEnv: 'development', resendApiKey: '', from: 'x' })(message);
  } finally {
    console.log = original;
  }
  assert.equal(printed.length, 1);
  assert.match(printed[0], /not sent/);
  assert.match(printed[0], /123456/);
});
