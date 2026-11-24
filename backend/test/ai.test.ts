import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import express from 'express';
import mongoose from 'mongoose';
import { ApiError, FinishReason } from '@google/genai';
import { z } from 'zod';
import { RUN_ID } from './support/testRun.js';
import {
  deleteUsageRecords,
  fallbackFromSettings,
  generateValidated,
  InvalidAiOutputError,
  providerFromSettings,
  runAi,
  setAiProviderForTests,
  thinkingFromSettings,
  type AiUsage,
} from '../src/ai/aiService.js';
import { classifyGeminiError, createGeminiProvider, type GeminiClient } from '../src/ai/gemini.js';
import { createMockProvider } from '../src/ai/mock.js';
import { connectivityCheckPrompt } from '../src/ai/prompts/connectivityCheck.js';
import { AiProviderError } from '../src/ai/provider.js';
import { connectivityCheckSchema } from '../src/ai/schemas/connectivityCheck.js';
import { env } from '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { AppError } from '../src/lib/errors.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { AI_FEATURES, UsageRecord } from '../src/models/UsageRecord.js';
import { isFeatureAllowed } from '../src/services/entitlements.js';

// All tests use the mock provider (or a fake Gemini client): no network, no quota.
// Own database per run for the usage records (dropped at the end).
const DB_NAME = `kobaniq_test_ai_${RUN_ID}`;
const GOOD = { language: 'en', sentence: 'A stall sells fruit.', fruitCount: 3 };
const prompt = connectivityCheckPrompt('en');
const originalLimit = env.aiUserRequestsPerHour;
const originalTimeout = env.aiTimeoutMs;

let server: Server;
let baseUrl: string;

before(async () => {
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await UsageRecord.syncIndexes();

  // A tiny app with one AI route and the real error handler (for translated messages).
  const app = express();
  app.get('/ai-test', async (_req, res, next) => {
    try {
      const data = await runAi({
        feature: 'connectivity_check',
        userId: new mongoose.Types.ObjectId(),
        prompt,
        schema: connectivityCheckSchema,
      });
      res.json({ data, error: null, meta: {} });
    } catch (err) {
      next(err);
    }
  });
  app.use(errorHandler);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  env.aiUserRequestsPerHour = originalLimit;
  env.aiTimeoutMs = originalTimeout;
  env.aiRetryDelayMs = 5;
});

afterEach(() => setAiProviderForTests(undefined));

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

const user = () => new mongoose.Types.ObjectId();

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof AppError, `expected AppError, got ${String(err)}`);
    assert.equal(err.status, status);
    assert.equal(err.code, code);
    return true;
  });
}

// ------------------------------------------------------------ validation and retry

test('a valid answer is returned as checked data; the request carries schema, rules and limits', async () => {
  const mock = createMockProvider();
  mock.reply({ json: GOOD });
  const data = await generateValidated({
    provider: mock.provider,
    prompt,
    schema: connectivityCheckSchema,
  });
  assert.deepEqual(data, GOOD);

  const request = mock.requests[0];
  assert.equal(
    request.jsonSchema.additionalProperties,
    false,
    'JSON Schema made from the strict Zod schema',
  );
  assert.deepEqual(request.jsonSchema.required, ['language', 'sentence', 'fruitCount']);
  assert.match(request.system, /Never invent/);
  assert.match(request.system, /English/);
  assert.equal(request.maxOutputTokens, 4096);
  assert.match(request.prompt, /<text>[\s\S]*<\/text>/, 'user text marked as data');
});

test('invalid JSON is retried once; the retry asks for JSON only', async () => {
  const mock = createMockProvider();
  mock.reply({ text: 'Sure! Here is your JSON: {oops' }, { json: GOOD });
  const usage = { inputTokens: 0, outputTokens: 0, attempts: 0 };
  const data = await generateValidated({
    provider: mock.provider,
    prompt,
    schema: connectivityCheckSchema,
    usage,
  });
  assert.deepEqual(data, GOOD);
  assert.equal(usage.attempts, 2);
  assert.match(mock.requests[1].prompt, /Answer again with JSON only/);
});

test('invalid output twice fails cleanly: exactly 2 requests, never more', async () => {
  for (const [bad, reason] of [
    [{ text: 'not json' }, 'not_json'],
    [{ text: '   ' }, 'empty'],
    [{ json: { ...GOOD, fruitCount: 'three' } }, 'schema'],
    [{ json: { ...GOOD, extra: 'unexpected property' } }, 'schema'],
    [{ json: { language: 'en' } }, 'schema'],
    [{ json: { ...GOOD, language: 'fr' } }, 'schema'],
    [{ json: GOOD, truncated: true }, 'truncated'],
  ] as const) {
    const mock = createMockProvider();
    mock.reply(bad, bad);
    await assert.rejects(
      generateValidated({ provider: mock.provider, prompt, schema: connectivityCheckSchema }),
      (err: unknown) => err instanceof InvalidAiOutputError && err.reason === reason,
      `reason ${reason}`,
    );
    assert.equal(mock.requests.length, 2, `${reason}: one retry only`);
  }
});

test('provider failures are not retried here (no wasted quota)', async () => {
  const mock = createMockProvider();
  mock.reply({ error: new AiProviderError('quota', 'quota reached', 429) }, { json: GOOD });
  await assert.rejects(
    generateValidated({ provider: mock.provider, prompt, schema: connectivityCheckSchema }),
    (err: unknown) => err instanceof AiProviderError && err.kind === 'quota',
  );
  assert.equal(mock.requests.length, 1);
  assert.equal(mock.pending(), 1);
});

const busy = () =>
  new AiProviderError('unavailable', 'overloaded', 503, { providerStatus: 'UNAVAILABLE' });

test('a busy provider is tried twice more with growing pauses; a third outage is reported', async () => {
  const mock = createMockProvider();
  mock.reply({ error: busy() }, { error: busy() }, { json: GOOD });
  assert.deepEqual(
    await generateValidated({ provider: mock.provider, prompt, schema: connectivityCheckSchema }),
    GOOD,
  );
  assert.equal(mock.requests.length, 3);

  const down = createMockProvider();
  down.reply({ error: busy() }, { error: busy() }, { error: busy() }, { json: GOOD });
  const usage: AiUsage = { inputTokens: 0, outputTokens: 0, attempts: 0 };
  await assert.rejects(
    generateValidated({ provider: down.provider, prompt, schema: connectivityCheckSchema, usage }),
    (err: unknown) => err instanceof AiProviderError && err.kind === 'unavailable',
  );
  assert.equal(down.requests.length, 3, 'two extra tries, never more');
  assert.equal(down.pending(), 1);
  assert.equal(usage.providerStatus, 'UNAVAILABLE');
  assert.equal(usage.calls, 3);
});

test('a per-minute rate limit (429) is retried like an outage', async () => {
  const limited = createMockProvider();
  limited.reply({ error: new AiProviderError('rate_limited', 'rpm', 429) }, { json: GOOD });
  assert.deepEqual(
    await generateValidated({
      provider: limited.provider,
      prompt,
      schema: connectivityCheckSchema,
    }),
    GOOD,
  );
  assert.equal(limited.requests.length, 2);
});

test('the retry-after wait suggested by the provider is respected when longer', async () => {
  const mock = createMockProvider();
  mock.reply(
    { error: new AiProviderError('rate_limited', 'rpm', 429, { retryAfterMs: 120 }) },
    { json: GOOD },
  );
  const started = Date.now();
  await generateValidated({ provider: mock.provider, prompt, schema: connectivityCheckSchema });
  assert.ok(Date.now() - started >= 110, 'waited the suggested time');
});

test('busy main model: the second model answers at once (and the record says so)', async () => {
  const main = createMockProvider('gemini-3.1-flash-lite');
  const second = createMockProvider('gemini-3.5-flash-lite');
  main.reply({ error: busy() });
  second.reply({ json: GOOD });
  setAiProviderForTests(main.provider, second.provider);
  const userId = user();
  assert.deepEqual(await runAi(task(userId)), GOOD);
  assert.equal(main.requests.length, 1);
  assert.equal(second.requests.length, 1);
  const r = await UsageRecord.findOne({ userId }).lean();
  assert.equal(r?.status, 'ok');
  assert.equal(r?.model, 'gemini-3.5-flash-lite');
  assert.equal(r?.fallbackUsed, true);
  assert.equal(r?.calls, 2);
  assert.equal(r?.providerStatus, 'UNAVAILABLE');
});

test('after switching, the rest of the request stays on the second model', async () => {
  const main = createMockProvider('main');
  const second = createMockProvider('second');
  main.reply({ error: busy() });
  second.reply({ text: 'not json' }, { json: GOOD });
  assert.deepEqual(
    await generateValidated({
      provider: main.provider,
      fallback: second.provider,
      prompt,
      schema: connectivityCheckSchema,
    }),
    GOOD,
  );
  assert.equal(main.requests.length, 1, 'the busy model is not asked again');
  assert.equal(second.requests.length, 2, 'the invalid answer is retried on the second model');
});

test('main model too slow: the second model; both busy: backoff on the second only', async () => {
  const slow = createMockProvider('main');
  const quick = createMockProvider('second');
  slow.reply({ hang: true });
  quick.reply({ json: GOOD });
  assert.deepEqual(
    await generateValidated({
      provider: slow.provider,
      fallback: quick.provider,
      prompt,
      schema: connectivityCheckSchema,
      timeoutMs: 50,
    }),
    GOOD,
  );

  const main = createMockProvider('main');
  const second = createMockProvider('second');
  main.reply({ error: busy() });
  second.reply({ error: busy() }, { error: busy() }, { error: busy() });
  await assert.rejects(
    generateValidated({
      provider: main.provider,
      fallback: second.provider,
      prompt,
      schema: connectivityCheckSchema,
    }),
    (err: unknown) => err instanceof AiProviderError && err.kind === 'unavailable',
  );
  assert.equal(main.requests.length + second.requests.length, 4, 'at most 4 calls in all');
});

test('the daily quota, a bad key or blocked content never go to the second model', async () => {
  for (const error of [
    new AiProviderError('quota', 'daily', 429),
    new AiProviderError('auth', 'key', 403),
    new AiProviderError('blocked', 'safety'),
  ]) {
    const main = createMockProvider('main');
    const second = createMockProvider('second');
    main.reply({ error });
    await assert.rejects(
      generateValidated({
        provider: main.provider,
        fallback: second.provider,
        prompt,
        schema: connectivityCheckSchema,
      }),
      (err: unknown) => err === error,
    );
    assert.equal(second.requests.length, 0, error.kind);
  }
});

test('the whole request ends within its total budget, whatever the retries', async () => {
  const main = createMockProvider('main');
  const second = createMockProvider('second');
  main.reply({ hang: true });
  second.reply({ hang: true }, { hang: true }, { hang: true });
  const started = Date.now();
  await assert.rejects(
    generateValidated({
      provider: main.provider,
      fallback: second.provider,
      prompt,
      schema: connectivityCheckSchema,
      timeoutMs: 400,
      totalBudgetMs: 2500,
    }),
    (err: unknown) => err instanceof AiProviderError && err.kind === 'timeout',
  );
  assert.ok(Date.now() - started < 2500, 'stopped inside the budget');
  assert.equal(main.requests.length + second.requests.length, 2, 'timeouts are not retried');
});

test('a long busy pause is skipped when it would pass the deadline', async () => {
  const mock = createMockProvider();
  mock.reply({
    error: new AiProviderError('rate_limited', 'rpm', 429, { retryAfterMs: 60_000 }),
  });
  const started = Date.now();
  await assert.rejects(
    generateValidated({
      provider: mock.provider,
      prompt,
      schema: connectivityCheckSchema,
      totalBudgetMs: 5000,
    }),
    (err: unknown) => err instanceof AiProviderError && err.kind === 'rate_limited',
  );
  assert.ok(Date.now() - started < 1000, 'did not sleep 60 s');
  assert.equal(mock.requests.length, 1);
});

test('the schema sent to the provider has no limits (Gemini refuses complex ones); Zod keeps them', async () => {
  const mock = createMockProvider();
  mock.reply({ json: { ...GOOD, sentence: 'x'.repeat(301) } }, { json: GOOD });
  await generateValidated({ provider: mock.provider, prompt, schema: connectivityCheckSchema });
  const sent = JSON.stringify(mock.requests[0].jsonSchema);
  for (const key of ['maxLength', 'minLength', 'maximum', 'minimum', 'maxItems']) {
    assert.equal(sent.includes(key), false, `no ${key}`);
  }
  assert.ok(sent.includes(String.raw`"enum":["en","so"]`), 'allowed values stay');
  assert.equal(mock.requests.length, 2, 'the too-long sentence was still rejected by Zod');
});

test('an answer that never comes ends at the time limit', async () => {
  const mock = createMockProvider();
  mock.reply({ hang: true });
  const started = Date.now();
  await assert.rejects(
    generateValidated({
      provider: mock.provider,
      prompt,
      schema: connectivityCheckSchema,
      timeoutMs: 50,
    }),
    (err: unknown) => err instanceof AiProviderError && err.kind === 'timeout',
  );
  assert.ok(Date.now() - started < 2000);
  assert.equal(mock.requests[0].signal.aborted, true, 'the provider request is aborted');
});

test('a custom schema works the same way (reusable for every feature)', async () => {
  const schema = z.object({ items: z.array(z.string()).max(3) }).strict();
  const mock = createMockProvider();
  mock.reply({ json: { items: ['a', 'b'] } });
  assert.deepEqual(await generateValidated({ provider: mock.provider, prompt, schema }), {
    items: ['a', 'b'],
  });
});

// ------------------------------------------------------------ settings

test('missing key or unknown provider → not configured; Gemini + key → Gemini provider', () => {
  assert.equal(providerFromSettings({ provider: 'gemini', apiKey: '', model: 'm' }), null);
  assert.equal(providerFromSettings({ provider: 'openai', apiKey: 'k', model: 'm' }), null);
  assert.equal(providerFromSettings({ provider: 'gemini', apiKey: 'k', model: '' }), null);
  const gemini = providerFromSettings({
    provider: 'gemini',
    apiKey: 'test-key',
    model: 'gemini-3.1-flash-lite',
  });
  assert.equal(gemini?.name, 'gemini');
  assert.equal(gemini?.model, 'gemini-3.1-flash-lite');
  assert.equal(env.geminiModel, 'gemini-3.1-flash-lite', 'default model');
});

// ------------------------------------------------------------ Gemini provider (fake client)

const SECRET = 'AIzaFAKE-SECRET-KEY-should-never-leak';

test('Gemini errors become provider-neutral kinds, never carrying the key', () => {
  const cases: [unknown, string][] = [
    [new ApiError({ status: 400, message: `API key not valid. key=${SECRET}` }), 'auth'],
    [new ApiError({ status: 403, message: 'PERMISSION_DENIED' }), 'auth'],
    [new ApiError({ status: 401, message: 'UNAUTHENTICATED' }), 'auth'],
    [new ApiError({ status: 429, message: 'RESOURCE_EXHAUSTED' }), 'rate_limited'],
    [
      new ApiError({
        status: 429,
        message:
          '{"error":{"status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}',
      }),
      'quota',
    ],
    [new ApiError({ status: 503, message: 'UNAVAILABLE' }), 'unavailable'],
    [new ApiError({ status: 500, message: 'INTERNAL' }), 'unavailable'],
    [new ApiError({ status: 504, message: 'DEADLINE_EXCEEDED' }), 'timeout'],
    [new ApiError({ status: 400, message: 'Invalid JSON schema' }), 'bad_request'],
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), 'timeout'],
    [new TypeError('fetch failed'), 'unavailable'],
  ];
  for (const [input, kind] of cases) {
    const result = classifyGeminiError(input);
    assert.equal(result.kind, kind, String((input as Error).message));
    assert.equal(result.message.includes(SECRET), false, 'no key in the message');
  }
});

test('Gemini error body: a safe status word and the retry-after hint, nothing else', () => {
  const overloaded = classifyGeminiError(
    new ApiError({
      status: 503,
      message:
        '{"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
    }),
  );
  assert.equal(overloaded.kind, 'unavailable');
  assert.equal(overloaded.details.providerStatus, 'UNAVAILABLE');
  assert.match(overloaded.message, /overloaded/);
  assert.equal(overloaded.message.includes('high demand'), false, 'our own wording only');

  const limited = classifyGeminiError(
    new ApiError({
      status: 429,
      message: '{"error":{"status":"RESOURCE_EXHAUSTED","details":[{"retryDelay":"7.5s"}]}}',
    }),
  );
  assert.equal(limited.kind, 'rate_limited');
  assert.equal(limited.details.retryAfterMs, 7500);
});

function fakeClient(
  answer: Awaited<ReturnType<GeminiClient['models']['generateContent']>> | Error,
) {
  const calls: unknown[] = [];
  const client: GeminiClient = {
    models: {
      async generateContent(params) {
        calls.push(params);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
  };
  return { client, calls };
}

test('Gemini request: model, system rules, JSON mode with the schema, limits, PDF before the text', async () => {
  const fake = fakeClient({
    text: JSON.stringify(GOOD),
    candidates: [{ finishReason: FinishReason.STOP }],
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 },
  });
  const provider = createGeminiProvider({
    apiKey: 'unused',
    model: 'gemini-3.1-flash-lite',
    client: fake.client,
  });
  const signal = new AbortController().signal;
  const answer = await provider.generate({
    system: 'rules',
    prompt: 'task',
    jsonSchema: { type: 'object' },
    maxOutputTokens: 256,
    documents: [{ mimeType: 'application/pdf', data: 'JVBERi0=' }],
    signal,
  });
  assert.deepEqual(answer, {
    text: JSON.stringify(GOOD),
    inputTokens: 120,
    outputTokens: 30,
    truncated: false,
  });

  const params = fake.calls[0] as {
    model: string;
    contents: { parts: Record<string, unknown>[] }[];
    config: Record<string, unknown>;
  };
  assert.equal(params.model, 'gemini-3.1-flash-lite');
  assert.equal(params.config.systemInstruction, 'rules');
  assert.equal(params.config.responseMimeType, 'application/json');
  assert.deepEqual(params.config.responseJsonSchema, { type: 'object' });
  assert.equal(params.config.maxOutputTokens, 256);
  assert.equal(params.config.abortSignal, signal);
  assert.deepEqual(params.contents[0].parts[0], {
    inlineData: { mimeType: 'application/pdf', data: 'JVBERi0=' },
  });
  assert.deepEqual(params.contents[0].parts[1], { text: 'task' });
});

test('Gemini answers: cut off at the limit → truncated; safety stop → blocked; 429 → quota', async () => {
  const signal = new AbortController().signal;
  const request = { system: 's', prompt: 'p', jsonSchema: {}, maxOutputTokens: 10, signal };

  const cut = createGeminiProvider({
    apiKey: 'x',
    model: 'm',
    client: fakeClient({ text: '{"a":', candidates: [{ finishReason: FinishReason.MAX_TOKENS }] })
      .client,
  });
  assert.equal((await cut.generate(request)).truncated, true);

  const safety = createGeminiProvider({
    apiKey: 'x',
    model: 'm',
    client: fakeClient({ text: '', candidates: [{ finishReason: FinishReason.SAFETY }] }).client,
  });
  await assert.rejects(
    safety.generate(request),
    (err: unknown) => (err as AiProviderError).kind === 'blocked',
  );

  const limited = createGeminiProvider({
    apiKey: 'x',
    model: 'm',
    client: fakeClient(new ApiError({ status: 429, message: 'RESOURCE_EXHAUSTED' })).client,
  });
  await assert.rejects(
    limited.generate(request),
    (err: unknown) => (err as AiProviderError).kind === 'rate_limited',
  );

  const daily = createGeminiProvider({
    apiKey: 'x',
    model: 'm',
    client: fakeClient(new ApiError({ status: 429, message: 'Quota exceeded: requests per day' }))
      .client,
  });
  await assert.rejects(
    daily.generate(request),
    (err: unknown) => (err as AiProviderError).kind === 'quota',
  );
});

test('Gemini request: the thinking level is sent only when set', async () => {
  const signal = new AbortController().signal;
  const base = { system: 's', prompt: 'p', jsonSchema: {}, maxOutputTokens: 10, signal };
  const answer = { text: '{}', candidates: [{ finishReason: FinishReason.STOP }] };
  const withLevel = fakeClient(answer);
  await createGeminiProvider({ apiKey: 'x', model: 'm', client: withLevel.client }).generate({
    ...base,
    thinkingLevel: 'low',
  });
  const config = (withLevel.calls[0] as { config: Record<string, unknown> }).config;
  assert.deepEqual(config.thinkingConfig, { thinkingLevel: 'LOW' });

  const without = fakeClient(answer);
  await createGeminiProvider({ apiKey: 'x', model: 'm', client: without.client }).generate(base);
  const plain = (without.calls[0] as { config: Record<string, unknown> }).config;
  assert.equal(plain.thinkingConfig, undefined);
});

test('settings: a second model only when it differs from the main one; thinking level checked', () => {
  const key = { provider: 'gemini', apiKey: 'k' };
  assert.equal(fallbackFromSettings({ ...key, model: '' }), null);
  assert.equal(fallbackFromSettings({ ...key, model: env.geminiModel }), null);
  assert.equal(
    fallbackFromSettings({ ...key, model: 'gemini-3.5-flash-lite' })?.model,
    'gemini-3.5-flash-lite',
  );
  assert.equal(thinkingFromSettings('low'), 'low');
  assert.equal(thinkingFromSettings('minimal'), 'minimal');
  assert.equal(thinkingFromSettings(''), undefined);
  assert.equal(thinkingFromSettings('turbo'), undefined);
});

// ------------------------------------------------------------ runAi: errors, usage, limits

const task = (userId = user()) => ({
  feature: 'connectivity_check' as const,
  userId,
  prompt,
  schema: connectivityCheckSchema,
});

test('missing API key → 503 AI_NOT_CONFIGURED, nothing sent, nothing recorded', async () => {
  setAiProviderForTests(null);
  const userId = user();
  await expectAppError(runAi(task(userId)), 503, 'AI_NOT_CONFIGURED');
  assert.equal(await UsageRecord.countDocuments({ userId }), 0);
});

test('success: usage recorded with tokens and attempts, and no prompt or answer content', async () => {
  const mock = createMockProvider('gemini-3.1-flash-lite');
  mock.reply({ text: 'oops' }, { json: GOOD, inputTokens: 200, outputTokens: 40 });
  setAiProviderForTests(mock.provider);
  const userId = user();
  assert.deepEqual(await runAi(task(userId)), GOOD);

  const records = await UsageRecord.find({ userId }).lean();
  assert.equal(records.length, 1);
  const r = records[0];
  assert.equal(r.status, 'ok');
  assert.equal(r.feature, 'connectivity_check');
  assert.equal(r.provider, 'mock');
  assert.equal(r.model, 'gemini-3.1-flash-lite');
  assert.equal(r.attempts, 2);
  assert.equal(r.inputTokens, 200, 'tokens of both attempts (the bad one reported none)');
  assert.equal(r.outputTokens, 40);
  assert.equal(r.calls, 2);
  assert.equal(r.fallbackUsed, false);
  assert.equal(mock.requests[0].thinkingLevel, 'low', 'GEMINI_THINKING_LEVEL (default low)');
  const stored = JSON.stringify(r);
  assert.equal(stored.includes('mangoes'), false, 'no prompt text stored');
  assert.equal(stored.includes('A stall sells fruit'), false, 'no answer text stored');
});

test('each failure → its error code and a usage record with the status', async () => {
  const cases: [
    Parameters<ReturnType<typeof createMockProvider>['reply']>[0][],
    number,
    string,
    string,
  ][] = [
    [[{ text: 'x' }, { text: 'y' }], 502, 'AI_BAD_OUTPUT', 'invalid_output'],
    [
      [{ error: new AiProviderError('auth', 'Gemini rejected the API key (HTTP 400)', 400) }],
      503,
      'AI_NOT_CONFIGURED',
      'auth',
    ],
    [[{ error: new AiProviderError('quota', 'quota', 429) }], 503, 'AI_QUOTA_REACHED', 'quota'],
    [
      [
        { error: new AiProviderError('rate_limited', 'rpm', 429) },
        { error: new AiProviderError('rate_limited', 'rpm', 429) },
        { error: new AiProviderError('rate_limited', 'rpm', 429) },
      ],
      503,
      'AI_QUOTA_REACHED',
      'quota',
    ],
    [
      [
        { error: new AiProviderError('unavailable', 'down', 503) },
        { error: new AiProviderError('unavailable', 'still down', 503) },
        { error: new AiProviderError('unavailable', 'still down', 503) },
      ],
      503,
      'AI_UNAVAILABLE',
      'unavailable',
    ],
    [[{ error: new AiProviderError('blocked', 'declined') }], 502, 'AI_BAD_OUTPUT', 'blocked'],
  ];
  for (const [replies, status, code, usageStatus] of cases) {
    const mock = createMockProvider();
    mock.reply(...replies);
    setAiProviderForTests(mock.provider);
    const userId = user();
    await expectAppError(runAi(task(userId)), status, code);
    const record = await UsageRecord.findOne({ userId }).lean();
    assert.equal(record?.status, usageStatus, code);
    assert.equal(record?.errorCode, code);
  }
});

test('timeout → 504 AI_TIMEOUT', async () => {
  env.aiTimeoutMs = 50;
  const mock = createMockProvider();
  mock.reply({ hang: true });
  setAiProviderForTests(mock.provider);
  const userId = user();
  await expectAppError(runAi(task(userId)), 504, 'AI_TIMEOUT');
  assert.equal((await UsageRecord.findOne({ userId }).lean())?.status, 'timeout');
});

test('per-user hourly limit → 429 AI_LIMIT_REACHED without calling the provider', async () => {
  env.aiUserRequestsPerHour = 3;
  const mock = createMockProvider();
  mock.reply({ json: GOOD }, { json: GOOD }, { json: GOOD }, { json: GOOD });
  setAiProviderForTests(mock.provider);
  const userId = user();
  for (let i = 0; i < 3; i += 1) await runAi(task(userId));
  await expectAppError(runAi(task(userId)), 429, 'AI_LIMIT_REACHED');
  await expectAppError(runAi(task(userId)), 429, 'AI_LIMIT_REACHED');
  assert.equal(mock.requests.length, 3, 'capped requests never reached the provider');
  // TIQ-23: stopped requests are recorded for the admins (no tokens, not sent).
  const capped = await UsageRecord.find({ userId, status: 'capped' }).lean();
  assert.equal(capped.length, 2, 'capped requests do not count towards the cap again');
  assert.equal(capped[0].errorCode, 'AI_LIMIT_REACHED');
  assert.equal(capped[0].attempts, 0);
  assert.equal(capped[0].inputTokens + capped[0].outputTokens, 0);
  // Another user is not affected.
  assert.deepEqual(await runAi(task()), GOOD);
});

test('TIQ-23: every AI call goes through runAi (and so writes a usage record)', () => {
  // Only the AI layer may talk to a provider; features call runAi. The developer
  // scripts (npm run ai:check, no user, not part of the app) are the exception.
  const srcDir = join(__dirname, '..', 'src');
  const offenders = readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.ts'))
    .map((f) => join(f.parentPath, f.name))
    .filter((file) => !/[\\/]src[\\/](ai|scripts)[\\/]/.test(file))
    .filter((file) => {
      const code = readFileSync(file, 'utf8');
      return /@google\/genai|ai\/gemini\.js|ai\/provider\.js|providerFromSettings|generateValidated/.test(
        code,
      );
    });
  assert.deepEqual(offenders, []);
});

test('TIQ-23: the free app allows every AI feature (entitlements)', async () => {
  for (const feature of AI_FEATURES) assert.equal(await isFeatureAllowed(user(), feature), true);
});

test('deleting an account removes its usage records', async () => {
  const mock = createMockProvider();
  mock.reply({ json: GOOD });
  setAiProviderForTests(mock.provider);
  const userId = user();
  await runAi(task(userId));
  await deleteUsageRecords(userId);
  assert.equal(await UsageRecord.countDocuments({ userId }), 0);
});

// ------------------------------------------------------------ translated messages

async function aiRoute(language: string) {
  const res = await fetch(`${baseUrl}/ai-test`, { headers: { 'Accept-Language': language } });
  return {
    status: res.status,
    body: (await res.json()) as { error: { code: string; message: string } },
  };
}

test('AI errors reach the apps in English or Somali, with a stable code', async () => {
  const expected: [string, () => void, number, string, string][] = [
    [
      'AI_QUOTA_REACHED',
      () => {
        const mock = createMockProvider();
        mock.reply({ error: new AiProviderError('quota', 'q', 429) });
        setAiProviderForTests(mock.provider);
      },
      503,
      'The free AI limit has been reached for now. Please try again later',
      'Xadka bilaashka ah ee AI waa la gaaray hadda. Fadlan isku day mar dambe',
    ],
    [
      'AI_NOT_CONFIGURED',
      () => setAiProviderForTests(null),
      503,
      'The AI service is not set up yet. Please try again later',
      'Adeegga AI weli lama diyaarin. Fadlan isku day mar dambe',
    ],
  ];
  for (const [code, arrange, status, english, somali] of expected) {
    arrange();
    const en = await aiRoute('en');
    assert.equal(en.status, status);
    assert.deepEqual(en.body.error, { code, message: english });
    arrange();
    const so = await aiRoute('so');
    assert.deepEqual(so.body.error, { code, message: somali });
  }
});
