import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

/**
 * Owner decision (2026-11-19): while KOBANIQ uses the Gemini free tier, real
 * users' profiles and CVs are never sent to the AI. AI features that need a
 * user's personal data call this first; with AI_PERSONAL_DATA=blocked only
 * test accounts (fake data) pass.
 */
export function isTestAccountEmail(email: string, domains = env.aiTestEmailDomains) {
  const domain = email.toLowerCase().split('@')[1] ?? '';
  return (
    domain.endsWith('.invalid') || domains.some((d) => domain === d || domain.endsWith(`.${d}`))
  );
}

export function assertPersonalDataAllowed(email: string) {
  if (env.aiPersonalData === 'allowed' || isTestAccountEmail(email)) return;
  throw new AppError(
    403,
    'AI_PERSONAL_DATA_BLOCKED',
    'Creating CVs with AI is not available yet. KOBANIQ uses a free AI service during development, which must not receive personal data',
  );
}
