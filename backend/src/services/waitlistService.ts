import { AppError } from '../lib/errors.js';
import { EMAIL_RE } from '../lib/validate.js';
import { Waitlist } from '../models/Waitlist.js';

export const WAITLIST_NAME_MAX = 80;
const EMAIL_MAX = 254;

export interface WaitlistInput {
  email: string;
  name?: string;
  language: 'en' | 'so';
}

/**
 * Checks the landing page form. `website` is a hidden field people never see:
 * when a bot fills it, the answer looks normal but nothing is saved.
 */
export function parseWaitlist(body: unknown): { input: WaitlistInput; bot: boolean } {
  const b = (body ?? {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) details.email = 'emailInvalid';
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length > WAITLIST_NAME_MAX) details.name = 'textTooLong';
  if (b.language !== 'en' && b.language !== 'so') details.language = 'languageInvalid';
  if (b.consent !== true) details.consent = 'consentRequired';
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  const bot = typeof b.website === 'string' && b.website.trim() !== '';
  return {
    input: { email, ...(name ? { name } : {}), language: b.language as 'en' | 'so' },
    bot,
  };
}

/** POST /waitlist (TIQ-34): saves the email once; the same email again is refused politely (409). */
export async function joinWaitlist(input: WaitlistInput) {
  try {
    await Waitlist.create({ ...input, consentAt: new Date() });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError(409, 'WAITLIST_EXISTS', 'This email is already on the waitlist');
    }
    throw err;
  }
}
