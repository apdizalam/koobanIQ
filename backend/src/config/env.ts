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
  /**
   * Proxies in front of the server (Render and most hosts add one). With 1 the
   * server reads the visitor's real address from the proxy, so per-address limits
   * and audit records see real visitors, not the proxy. 0 when run directly.
   */
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
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
   * Error alerts (TIQ-25) go to this address: server errors, crashes, AI outages.
   * Empty = alerts off. With Resend's test sender it must be the Resend account's email.
   */
  alertEmail: (process.env.ALERT_EMAIL ?? '').trim(),
  /** At most one alert email per kind of problem in this time (milliseconds). */
  alertCooldownMs: Number(process.env.ALERT_COOLDOWN_MS ?? 15 * 60_000),
  /**
   * Must new accounts confirm their email with a code before using the app?
   * Off by default (owner decision 2026-11-19: Resend's test sender only reaches
   * the owner's inbox until a domain is verified). Turn on with
   * EMAIL_VERIFICATION_REQUIRED=true once emails reach every user.
   */
  emailVerificationRequired:
    (process.env.EMAIL_VERIFICATION_REQUIRED ?? 'false').trim().toLowerCase() === 'true',
  /**
   * AI provider behind src/ai/provider.ts. Only "gemini" exists today (Gemini
   * API free tier, development); the AI features never call a provider directly.
   */
  aiProvider: (process.env.AI_PROVIDER ?? 'gemini').trim().toLowerCase(),
  /** Gemini API key (aistudio.google.com). Server only: never sent to the apps or logged. */
  geminiApiKey: (process.env.GEMINI_API_KEY ?? '').trim(),
  /** Free-tier model; change it here without touching code. */
  geminiModel: (process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite').trim(),
  /**
   * Second Gemini model (same key, same provider) tried when the main one is
   * overloaded, rate limited or does not answer in time. Empty = no second model.
   * Investigation 2026-11-24: 3.1 Flash-Lite answered 503 "high demand" for 25+
   * minutes while 3.5 Flash-Lite answered at once.
   */
  geminiFallbackModel: (process.env.GEMINI_FALLBACK_MODEL ?? '').trim(),
  /**
   * How much Gemini "thinks" before answering: minimal | low | medium | high, or
   * empty for the model's default. Gemini 3.x thinks by default, which is slower;
   * our tasks are structured fill-in work, so "low" is the default.
   */
  geminiThinkingLevel: (process.env.GEMINI_THINKING_LEVEL ?? 'low').trim().toLowerCase(),
  /** Longest wait for one AI answer before giving up (milliseconds); features may allow more. */
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30_000),
  /**
   * The most time one AI request may take in total, with every retry and the
   * second model (milliseconds). Stays under the app's 120 s wait.
   */
  aiTotalBudgetMs: Number(process.env.AI_TOTAL_BUDGET_MS ?? 90_000),
  /** First pause before trying a busy AI provider again; the next pause is longer (milliseconds). */
  aiRetryDelayMs: Number(process.env.AI_RETRY_DELAY_MS ?? 2000),
  /** AI requests one user may make per hour (protects the free quota). */
  aiUserRequestsPerHour: Number(process.env.AI_USER_REQUESTS_PER_HOUR ?? 30),
  /**
   * Email notifications (TIQ-22, new strong matches). Off by default (owner
   * decision 2026-11-21): Resend's test sender only reaches the owner's inbox
   * until a domain is verified. Turn on with NOTIFICATION_EMAILS_ENABLED=true.
   */
  notificationEmailsEnabled:
    (process.env.NOTIFICATION_EMAILS_ENABLED ?? 'false').trim().toLowerCase() === 'true',
  /**
   * Google sign-in (TIQ-39): one free "Web application" OAuth client from Google
   * Cloud Console. The secret stays on the server. GOOGLE_REDIRECT_URI must be this
   * server's public https address + /api/v1/auth/google/callback, exactly as
   * entered in the console. Empty: the Google button answers "not set up".
   */
  googleClientId: (process.env.GOOGLE_CLIENT_ID ?? '').trim(),
  googleClientSecret: (process.env.GOOGLE_CLIENT_SECRET ?? '').trim(),
  googleRedirectUri: (process.env.GOOGLE_REDIRECT_URI ?? '').trim(),
};
