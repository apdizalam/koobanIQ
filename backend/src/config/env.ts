import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export type NodeEnv = 'development' | 'test' | 'staging' | 'production';

function readNodeEnv(): NodeEnv {
  const value = process.env.NODE_ENV ?? 'development';
  if (
    value === 'development' ||
    value === 'test' ||
    value === 'staging' ||
    value === 'production'
  ) {
    return value;
  }
  return 'development';
}

const nodeEnv = readNodeEnv();

/** Default Atlas database per environment (see doc 6 · Tech Stack). */
const defaultDbName: Record<NodeEnv, string> = {
  development: 'kobaniq_dev',
  test: 'kobaniq_test',
  staging: 'kobaniq_staging',
  production: 'kobaniq_prod',
};

/**
 * Secret for signing access tokens. Required in staging and production. In
 * development and tests a random one is made at start-up (tokens then stop
 * working after a restart).
 */
function readAccessSecret(): string {
  const value = process.env.JWT_ACCESS_SECRET;
  if (value) return value;
  if (nodeEnv === 'production' || nodeEnv === 'staging') {
    throw new Error('JWT_ACCESS_SECRET is not set. Add it to backend/.env (see .env.example).');
  }
  return randomBytes(48).toString('base64url');
}

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 5000),
  // MONGODB_URI is the documented name; MONGO_URI is accepted for existing local .env files.
  mongoUri: process.env.MONGODB_URI ?? process.env.MONGO_URI ?? '',
  mongoDbName: process.env.MONGODB_DB_NAME ?? defaultDbName[nodeEnv],
  jwtAccessSecret: readAccessSecret(),
  /** Access token lifetime, e.g. "15m" (architecture doc: 15 minutes). */
  jwtAccessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  /** Refresh token lifetime in days (architecture doc: 30 days). */
  refreshTokenDays: Number(process.env.REFRESH_TOKEN_DAYS ?? 30),
  /** Resend API key (resend.com). Empty in development: emails are printed in the terminal. */
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  /** Sender shown in emails. Resend's test sender only delivers to the Resend account owner. */
  emailFrom: process.env.EMAIL_FROM ?? 'KOBANIQ <onboarding@resend.dev>',
  /**
   * AI provider behind src/ai/provider.ts. Only "gemini" exists today (Gemini
   * API free tier, development); the AI features never call a provider directly.
   */
  aiProvider: (process.env.AI_PROVIDER ?? 'gemini').trim().toLowerCase(),
  /** Gemini API key (aistudio.google.com). Server only: never sent to the apps or logged. */
  geminiApiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
  /** Free-tier model; change it here without touching code. */
  geminiModel: (process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite').trim(),
  /** Longest wait for one AI answer before giving up (milliseconds). */
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
  /** Pause before trying a temporarily unavailable AI provider once more (milliseconds). */
  aiRetryDelayMs: Number(process.env.AI_RETRY_DELAY_MS ?? 3000),
  /** AI requests one user may make per hour (protects the free quota). */
  aiUserRequestsPerHour: Number(process.env.AI_USER_REQUESTS_PER_HOUR ?? 30),
};
