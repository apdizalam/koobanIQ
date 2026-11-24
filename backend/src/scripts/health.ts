/**
 * Service health check (TIQ-28): `npm run health` (repo root) or
 * `npm run health -w backend`.
 *
 * Checks the services KOBANIQ really uses, with the keys in backend/.env:
 * - MongoDB Atlas: connect and ping.
 * - AI (Gemini, free tier): one tiny request with a synthetic sentence (no
 *   personal data) whose answer must be valid JSON matching the schema, to the
 *   main model and to the second model (GEMINI_FALLBACK_MODEL) when one is set.
 * - Email (Resend): the API key is accepted (a read-only call; sends nothing).
 * Prints OK / FAILED per service and never prints a key. Exit code 1 if any fails.
 */
import mongoose from 'mongoose';
import {
  fallbackFromSettings,
  generateValidated,
  providerFromSettings,
  thinkingFromSettings,
  type AiUsage,
} from '../ai/aiService.js';
import { connectivityCheckPrompt } from '../ai/prompts/connectivityCheck.js';
import { AiProviderError, type AiProvider } from '../ai/provider.js';
import { connectivityCheckSchema } from '../ai/schemas/connectivityCheck.js';
import { env } from '../config/env.js';
import { connectDB } from '../lib/db.js';

type Result = { service: string; ok: boolean; detail: string };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200);

async function checkDatabase(): Promise<Result> {
  try {
    await connectDB({ retries: 1 });
    await mongoose.connection.db!.admin().ping();
    return { service: 'MongoDB Atlas', ok: true, detail: `connected (db: ${env.mongoDbName})` };
  } catch (err) {
    return { service: 'MongoDB Atlas', ok: false, detail: message(err) };
  }
}

/** One tiny synthetic request to one model; "overloaded" is named apart from key problems. */
async function checkModel(provider: AiProvider): Promise<{ ok: boolean; detail: string }> {
  try {
    const usage: AiUsage = { inputTokens: 0, outputTokens: 0, attempts: 0 };
    const started = Date.now();
    const answer = await generateValidated({
      provider,
      prompt: connectivityCheckPrompt('en'),
      schema: connectivityCheckSchema,
      maxOutputTokens: 512,
      thinkingLevel: thinkingFromSettings(),
      totalBudgetMs: 30_000,
      usage,
    });
    const ok = answer.fruitCount === 3;
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    return {
      ok,
      detail: `${provider.model}: valid JSON in ${seconds}s${ok ? '' : ', unexpected answer'} (tokens ${usage.inputTokens}/${usage.outputTokens}, calls ${usage.calls ?? 1})`,
    };
  } catch (err) {
    if (err instanceof AiProviderError && err.details.providerStatus === 'UNAVAILABLE') {
      return {
        ok: false,
        detail: `${provider.model}: overloaded at Google (HTTP 503 UNAVAILABLE)`,
      };
    }
    return { ok: false, detail: `${provider.model}: ${message(err)}` };
  }
}

/**
 * The main model and, when set, the second model (GEMINI_FALLBACK_MODEL). AI is
 * OK when at least one answers: the app then still works (on the second model).
 */
async function checkAi(): Promise<Result> {
  const provider = providerFromSettings();
  if (!provider) {
    return {
      service: 'AI (Gemini)',
      ok: false,
      detail: 'not set up: AI_PROVIDER / GEMINI_API_KEY',
    };
  }
  const main = await checkModel(provider);
  const fallback = fallbackFromSettings();
  if (!fallback) return { service: 'AI (Gemini)', ...main };
  const second = await checkModel(fallback);
  return {
    service: 'AI (Gemini)',
    ok: main.ok || second.ok,
    detail: `main ${main.detail} | second ${second.detail}`,
  };
}

async function checkEmail(): Promise<Result> {
  if (!env.resendApiKey) {
    return { service: 'Email (Resend)', ok: false, detail: 'not set up: RESEND_API_KEY' };
  }
  try {
    // Read-only: lists the account's domains. Sends no email.
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${env.resendApiKey}` },
    });
    if (res.ok) {
      const body = (await res.json()) as { data?: { name: string; status: string }[] };
      const verified = (body.data ?? []).filter((d) => d.status === 'verified').length;
      return {
        service: 'Email (Resend)',
        ok: true,
        detail: `key accepted; verified sending domains: ${verified}${verified === 0 ? ' (test sender only until a domain is verified)' : ''}`,
      };
    }
    // A sending-only key (the safer kind) may not list domains: Resend still
    // recognised it, so it can send.
    const error = (await res.json().catch(() => ({}))) as { name?: string };
    if (res.status === 401 && error.name === 'restricted_api_key') {
      return { service: 'Email (Resend)', ok: true, detail: 'sending-only key accepted' };
    }
    return {
      service: 'Email (Resend)',
      ok: false,
      detail: `Resend answered ${res.status}${error.name ? ` (${error.name})` : ''}`,
    };
  } catch (err) {
    return { service: 'Email (Resend)', ok: false, detail: message(err) };
  }
}

async function run() {
  const results = [await checkDatabase(), await checkAi(), await checkEmail()];
  for (const r of results) console.log(`${r.ok ? 'OK    ' : 'FAILED'} ${r.service}: ${r.detail}`);
  await mongoose.disconnect().catch(() => undefined);
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    failed === 0 ? 'All services OK.' : `${failed} of ${results.length} services failed.`,
  );
  if (failed > 0) process.exitCode = 1;
}

void run();
