import type { Types } from 'mongoose';
import type { z } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { UsageRecord, type AiFeature, type UsageStatus } from '../models/UsageRecord.js';
import { createGeminiProvider } from './gemini.js';
import type { BuiltPrompt } from './prompts/shared.js';
import { AiProviderError, type AiDocument, type AiErrorKind, type AiProvider } from './provider.js';
import { toJsonSchema } from './schemas/common.js';

/** Default answer size limit (tokens); features may ask for more or less. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
/** The first answer plus one retry when the answer is not valid. Never more. */
export const MAX_ATTEMPTS = 2;

// ---------------------------------------------------------------- provider

export interface AiSettings {
  provider: string;
  apiKey: string;
  model: string;
}

/** The provider from the settings, or null when AI is not set up (no key, unknown provider). */
export function providerFromSettings(
  settings: AiSettings = {
    provider: env.aiProvider,
    apiKey: env.geminiApiKey,
    model: env.geminiModel,
  },
): AiProvider | null {
  if (settings.provider !== 'gemini' || !settings.apiKey || !settings.model) return null;
  return createGeminiProvider({ apiKey: settings.apiKey, model: settings.model });
}

let cached: AiProvider | null | undefined;
let testProvider: AiProvider | null | undefined;

/** Tests only: use this provider (null = "not configured"; undefined = back to the settings). */
export function setAiProviderForTests(provider: AiProvider | null | undefined) {
  testProvider = provider;
}

function currentProvider(): AiProvider | null {
  if (testProvider !== undefined) return testProvider;
  if (cached === undefined) cached = providerFromSettings();
  return cached;
}

// ---------------------------------------------------------------- errors

/** The answer could not be used, even after the retry. */
export class InvalidAiOutputError extends Error {
  constructor(public readonly reason: 'empty' | 'truncated' | 'not_json' | 'schema') {
    super(`AI answer was not valid (${reason})`);
    this.name = 'InvalidAiOutputError';
  }
}

const USAGE_STATUS: Record<AiErrorKind, UsageStatus> = {
  auth: 'auth',
  quota: 'quota',
  timeout: 'timeout',
  unavailable: 'unavailable',
  blocked: 'blocked',
  bad_request: 'unavailable',
};

/** Provider failure → API error with a code the apps can rely on (text translated by the error handler). */
function toAppError(err: AiProviderError): AppError {
  switch (err.kind) {
    case 'auth':
      return new AppError(
        503,
        'AI_NOT_CONFIGURED',
        'The AI service is not set up yet. Please try again later',
      );
    case 'quota':
      return new AppError(
        503,
        'AI_QUOTA_REACHED',
        'The free AI limit has been reached for now. Please try again later',
      );
    case 'timeout':
      return new AppError(504, 'AI_TIMEOUT', 'The AI took too long to answer. Please try again');
    case 'blocked':
      return new AppError(
        502,
        'AI_BAD_OUTPUT',
        'The AI could not give a usable answer. Please try again',
      );
    default:
      return new AppError(
        503,
        'AI_UNAVAILABLE',
        'The AI service is not available right now. Please try again later',
      );
  }
}

// ---------------------------------------------------------------- one validated answer

export interface GenerateOptions<T> {
  provider: AiProvider;
  prompt: BuiltPrompt;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  temperature?: number;
  documents?: AiDocument[];
  timeoutMs?: number;
  /** Filled in as the attempts run (tokens are counted even when it fails). */
  usage?: { inputTokens: number; outputTokens: number; attempts: number };
}

const RETRY_NOTE =
  '\n\nYour previous answer could not be used: it was not complete, valid JSON for the schema. ' +
  'Answer again with JSON only, following the schema exactly.';

/** Waits for the provider, but never longer than the time limit (even if it ignores the abort). */
async function withTimeLimit<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiProviderError('timeout', 'The AI did not answer in time'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller.signal), limit]);
  } finally {
    clearTimeout(timer);
  }
}

/** Parses and checks one answer; returns the data or why it is not usable. */
function checkAnswer<T>(
  text: string,
  truncated: boolean,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; reason: InvalidAiOutputError['reason'] } {
  if (truncated) return { ok: false, reason: 'truncated' };
  if (!text.trim()) return { ok: false, reason: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  const result = schema.safeParse(parsed);
  return result.success ? { ok: true, data: result.data } : { ok: false, reason: 'schema' };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One provider call. A temporary outage (overloaded, 5xx, network) is tried
 * once more after a short pause; quota, key, timeout and blocked content are
 * not retried (a retry would not help, or would spend quota).
 */
async function callProvider(
  options: GenerateOptions<unknown>,
  request: Omit<Parameters<AiProvider['generate']>[0], 'signal'>,
) {
  for (let outageRetry = 0; ; outageRetry += 1) {
    try {
      return await withTimeLimit(
        (signal) => options.provider.generate({ ...request, signal }),
        options.timeoutMs ?? env.aiTimeoutMs,
      );
    } catch (err) {
      if (err instanceof AiProviderError && err.kind === 'unavailable' && outageRetry < 1) {
        await sleep(env.aiRetryDelayMs);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Asks the provider for JSON matching `schema`. A malformed answer (empty,
 * cut off, not JSON, or not matching the schema) is retried once, then fails
 * with InvalidAiOutputError. Provider failures are thrown as AiProviderError;
 * only a temporary outage is tried once more (see callProvider).
 */
export async function generateValidated<T>(options: GenerateOptions<T>): Promise<T> {
  const usage = options.usage ?? { inputTokens: 0, outputTokens: 0, attempts: 0 };
  const jsonSchema = toJsonSchema(options.schema);
  let reason: InvalidAiOutputError['reason'] = 'empty';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    usage.attempts = attempt;
    const response = await callProvider(options as GenerateOptions<unknown>, {
      system: options.prompt.system,
      prompt: attempt === 1 ? options.prompt.prompt : options.prompt.prompt + RETRY_NOTE,
      jsonSchema,
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      temperature: options.temperature,
      documents: options.documents,
    });
    usage.inputTokens += response.inputTokens ?? 0;
    usage.outputTokens += response.outputTokens ?? 0;
    const checked = checkAnswer(response.text, response.truncated, options.schema);
    if (checked.ok) return checked.data;
    reason = checked.reason;
  }
  throw new InvalidAiOutputError(reason);
}

// ---------------------------------------------------------------- the entry point for features

export interface AiTask<T> {
  feature: AiFeature;
  /** The signed-in user (limits and usage records). */
  userId: Types.ObjectId;
  prompt: BuiltPrompt;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  temperature?: number;
  documents?: AiDocument[];
}

/** Over the per-user hourly limit → 429 (protects the shared free quota). */
async function checkUserLimit(userId: Types.ObjectId) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const used = await UsageRecord.countDocuments({ userId, createdAt: { $gte: since } });
  if (used >= env.aiUserRequestsPerHour) {
    throw new AppError(
      429,
      'AI_LIMIT_REACHED',
      'You have used the AI features a lot in the last hour. Please try again later',
    );
  }
}

async function record(
  task: AiTask<unknown>,
  provider: AiProvider,
  status: UsageStatus,
  usage: { inputTokens: number; outputTokens: number; attempts: number },
  started: number,
  errorCode?: string,
) {
  // Monitoring must never break the user's request.
  await UsageRecord.create({
    userId: task.userId,
    feature: task.feature,
    provider: provider.name,
    model: provider.model,
    status,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    attempts: Math.max(usage.attempts, 1),
    durationMs: Date.now() - started,
    errorCode,
  }).catch(() => console.warn('[ai] usage record could not be saved'));
}

/**
 * Runs one AI task for a feature: checks the setup and the user's hourly limit,
 * gets a validated answer (one retry for invalid output), records usage (no
 * content), and turns every failure into a translated API error. Never falls
 * back to another (paid) provider.
 */
export async function runAi<T>(task: AiTask<T>): Promise<T> {
  const provider = currentProvider();
  if (!provider) {
    console.warn(
      '[ai] AI is not configured: set AI_PROVIDER=gemini and GEMINI_API_KEY in backend/.env',
    );
    throw new AppError(
      503,
      'AI_NOT_CONFIGURED',
      'The AI service is not set up yet. Please try again later',
    );
  }
  await checkUserLimit(task.userId);

  const started = Date.now();
  const usage = { inputTokens: 0, outputTokens: 0, attempts: 0 };
  try {
    const data = await generateValidated({ ...task, provider, usage });
    await record(task, provider, 'ok', usage, started);
    return data;
  } catch (err) {
    if (err instanceof InvalidAiOutputError) {
      console.warn(
        `[ai] ${task.feature}: invalid answer after ${usage.attempts} attempts (${err.reason})`,
      );
      await record(task, provider, 'invalid_output', usage, started, 'AI_BAD_OUTPUT');
      throw new AppError(
        502,
        'AI_BAD_OUTPUT',
        'The AI could not give a usable answer. Please try again',
      );
    }
    if (err instanceof AiProviderError) {
      const appError = toAppError(err);
      // Safe for logs: our own message (status only), no key and no user content.
      if (err.kind === 'auth')
        console.error(`[ai] ${err.message}: check GEMINI_API_KEY in backend/.env`);
      else console.warn(`[ai] ${task.feature}: ${err.message}`);
      await record(task, provider, USAGE_STATUS[err.kind], usage, started, appError.code);
      throw appError;
    }
    throw err;
  }
}

/** Deleting an account deletes its usage records too. */
export async function deleteUsageRecords(userId: Types.ObjectId) {
  await UsageRecord.deleteMany({ userId });
}
