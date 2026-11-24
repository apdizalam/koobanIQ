import type { Types } from 'mongoose';
import type { z } from 'zod';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { UsageRecord, type AiFeature, type UsageStatus } from '../models/UsageRecord.js';
import { isFeatureAllowed } from '../services/entitlements.js';
import { createGeminiProvider } from './gemini.js';
import type { BuiltPrompt } from './prompts/shared.js';
import {
  AI_THINKING_LEVELS,
  AiProviderError,
  type AiDocument,
  type AiErrorKind,
  type AiProvider,
  type AiThinkingLevel,
} from './provider.js';
import { toJsonSchema } from './schemas/common.js';

/** Default answer size limit (tokens); features may ask for more or less. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
/** The first answer plus one retry when the answer is not valid. Never more. */
export const MAX_ATTEMPTS = 2;
/**
 * Pauses before trying a busy provider again, as multiples of AI_RETRY_DELAY_MS
 * (2 s → about 2 s, then about 5 s; ±25 % jitter). Google's advice for 503/429:
 * "retry with exponential backoff". Never more than these two.
 */
export const OUTAGE_BACKOFF = [1, 2.5] as const;
/** A call is not started with less time than this left in the request's budget. */
const MIN_CALL_MS = 2000;

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

/**
 * The second model (GEMINI_FALLBACK_MODEL), same provider and key, or null when
 * none is set (or it is the same as the main model).
 */
export function fallbackFromSettings(
  settings: AiSettings = {
    provider: env.aiProvider,
    apiKey: env.geminiApiKey,
    model: env.geminiFallbackModel,
  },
): AiProvider | null {
  if (!settings.model || settings.model === env.geminiModel) return null;
  return providerFromSettings(settings);
}

/** GEMINI_THINKING_LEVEL as a known level, or undefined (the model's default). */
export function thinkingFromSettings(value = env.geminiThinkingLevel): AiThinkingLevel | undefined {
  return (AI_THINKING_LEVELS as readonly string[]).includes(value)
    ? (value as AiThinkingLevel)
    : undefined;
}

let cached: { main: AiProvider | null; fallback: AiProvider | null } | undefined;
let testProviders: { main: AiProvider | null; fallback: AiProvider | null } | undefined;

/**
 * Tests only: use this provider, and optionally a second model (null = "not
 * configured"; undefined = back to the settings).
 */
export function setAiProviderForTests(
  provider: AiProvider | null | undefined,
  fallback: AiProvider | null = null,
) {
  testProviders = provider === undefined ? undefined : { main: provider, fallback };
}

function currentProviders() {
  if (testProviders !== undefined) return testProviders;
  if (cached === undefined) {
    const main = providerFromSettings();
    cached = { main, fallback: main ? fallbackFromSettings() : null };
  }
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
  rate_limited: 'quota',
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
    case 'rate_limited':
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

/** What one request used (tokens are counted even when it fails). No content. */
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  /** Answers asked for: 1, or 2 when the first was invalid. */
  attempts: number;
  /** Provider calls, outage retries and the second model included. */
  calls?: number;
  /** The model of the last call. */
  model?: string;
  fallbackUsed?: boolean;
  /** The provider's last error status word (e.g. UNAVAILABLE). */
  providerStatus?: string;
}

export interface GenerateOptions<T> {
  provider: AiProvider;
  /** Second model, tried when the main one is busy or does not answer in time. */
  fallback?: AiProvider | null;
  prompt: BuiltPrompt;
  schema: z.ZodType<T>;
  maxOutputTokens?: number;
  temperature?: number;
  thinkingLevel?: AiThinkingLevel;
  documents?: AiDocument[];
  /** Longest wait for one call (default AI_TIMEOUT_MS). */
  timeoutMs?: number;
  /** Longest wait for the whole request, every retry included (default AI_TOTAL_BUDGET_MS). */
  totalBudgetMs?: number;
  /** Filled in as the attempts run (tokens are counted even when it fails). */
  usage?: AiUsage;
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

/** A pause of about `ms` (±25 %), so many users do not retry at the same moment. */
const jitter = (ms: number) => Math.round(ms * (0.75 + Math.random() * 0.5));

/** The provider was busy (overloaded, rate limited, network): worth another try later. */
const isBusy = (err: AiProviderError) => err.kind === 'unavailable' || err.kind === 'rate_limited';

/**
 * Gets one answer from the provider within the request's deadline:
 * - busy (503 overloaded, 429 per-minute limit, network) or no answer in time
 *   → the second model at once, when there is one (and the rest of this request
 *   stays on it);
 * - still busy → up to two more tries after about 2 s and 5 s (or the provider's
 *   own "retry after", if longer), never past the deadline;
 * - daily quota, key, blocked content or a malformed request → not retried
 *   (a retry would not help, or would spend quota).
 */
async function callProvider(
  options: GenerateOptions<unknown>,
  state: { current: AiProvider; deadline: number; usage: AiUsage },
  request: Omit<Parameters<AiProvider['generate']>[0], 'signal'>,
) {
  const perCall = options.timeoutMs ?? env.aiTimeoutMs;
  for (let backoff = 0; ;) {
    const remaining = state.deadline - Date.now();
    if (remaining < MIN_CALL_MS) {
      throw new AiProviderError('timeout', 'The AI request ran out of time');
    }
    state.usage.calls = (state.usage.calls ?? 0) + 1;
    state.usage.model = state.current.model;
    try {
      return await withTimeLimit(
        (signal) => state.current.generate({ ...request, signal }),
        Math.min(perCall, remaining),
      );
    } catch (err) {
      if (!(err instanceof AiProviderError)) throw err;
      state.usage.providerStatus =
        err.details.providerStatus ?? (err.status !== undefined ? `HTTP_${err.status}` : err.kind);
      const fallback = options.fallback;
      if ((isBusy(err) || err.kind === 'timeout') && fallback && state.current !== fallback) {
        state.current = fallback;
        state.usage.fallbackUsed = true;
        continue;
      }
      if (isBusy(err) && backoff < OUTAGE_BACKOFF.length) {
        const pause = Math.max(
          err.details.retryAfterMs ?? 0,
          jitter(env.aiRetryDelayMs * OUTAGE_BACKOFF[backoff]),
        );
        if (Date.now() + pause + MIN_CALL_MS > state.deadline) throw err;
        backoff += 1;
        await sleep(pause);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Asks the provider for JSON matching `schema`. A malformed answer (empty,
 * cut off, not JSON, or not matching the schema) is retried once, then fails
 * with InvalidAiOutputError. Provider failures are thrown as AiProviderError
 * after the outage handling in callProvider. The whole request never takes
 * longer than its budget.
 */
export async function generateValidated<T>(options: GenerateOptions<T>): Promise<T> {
  const usage = options.usage ?? { inputTokens: 0, outputTokens: 0, attempts: 0 };
  const jsonSchema = toJsonSchema(options.schema);
  const state = {
    current: options.provider,
    deadline: Date.now() + (options.totalBudgetMs ?? env.aiTotalBudgetMs),
    usage,
  };
  let reason: InvalidAiOutputError['reason'] = 'empty';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    usage.attempts = attempt;
    const response = await callProvider(options as GenerateOptions<unknown>, state, {
      system: options.prompt.system,
      prompt: attempt === 1 ? options.prompt.prompt : options.prompt.prompt + RETRY_NOTE,
      jsonSchema,
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      temperature: options.temperature,
      thinkingLevel: options.thinkingLevel,
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
  /** Longer limit for big answers (e.g. a quiz bank); default AI_TIMEOUT_MS. */
  timeoutMs?: number;
}

/**
 * Hourly safety cap per user (owner decision 2026-11-21): protects the free AI
 * quota that all users share from one runaway client. It is not a plan or usage
 * limit; requests it stopped are recorded as `capped` (and not counted again),
 * so admins can see who meets it.
 */
async function overHourlyCap(userId: Types.ObjectId) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const used = await UsageRecord.countDocuments({
    userId,
    status: { $ne: 'capped' },
    createdAt: { $gte: since },
  });
  return used >= env.aiUserRequestsPerHour;
}

async function record(
  task: AiTask<unknown>,
  provider: AiProvider,
  status: UsageStatus,
  usage: AiUsage,
  started: number,
  errorCode?: string,
) {
  // Monitoring must never break the user's request.
  await UsageRecord.create({
    userId: task.userId,
    feature: task.feature,
    provider: provider.name,
    model: usage.model ?? provider.model,
    status,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    attempts: status === 'capped' ? 0 : Math.max(usage.attempts, 1),
    calls: usage.calls ?? 0,
    fallbackUsed: usage.fallbackUsed ?? false,
    providerStatus: usage.providerStatus,
    durationMs: Date.now() - started,
    errorCode,
  }).catch(() => console.warn('[ai] usage record could not be saved'));
}

/**
 * Runs one AI task for a feature: checks the setup and the hourly safety cap,
 * gets a validated answer (outage handling and one retry for invalid output),
 * records usage (no content), and turns every failure into a translated API
 * error. Only Gemini models on the configured key are used (main, then the
 * optional second model); never another (paid) provider.
 */
export async function runAi<T>(task: AiTask<T>): Promise<T> {
  const { main: provider, fallback } = currentProviders();
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
  // Free app: always allowed today; future paid plans plug in here (TIQ-23).
  if (!(await isFeatureAllowed(task.userId, task.feature))) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this page');
  }

  const started = Date.now();
  const usage: AiUsage = { inputTokens: 0, outputTokens: 0, attempts: 0 };
  if (await overHourlyCap(task.userId)) {
    await record(task, provider, 'capped', usage, started, 'AI_LIMIT_REACHED');
    throw new AppError(
      429,
      'AI_LIMIT_REACHED',
      'You have used the AI features a lot in the last hour. Please try again later',
    );
  }
  try {
    const data = await generateValidated({
      ...task,
      provider,
      fallback,
      thinkingLevel: thinkingFromSettings(),
      usage,
    });
    if (usage.fallbackUsed) {
      console.warn(`[ai] ${task.feature}: answered by the second model ${usage.model}`);
    }
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
      else
        console.warn(
          `[ai] ${task.feature}: ${err.message} after ${usage.calls ?? 0} call(s)` +
            ` (last model ${usage.model}, ${usage.providerStatus ?? err.kind})`,
        );
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
