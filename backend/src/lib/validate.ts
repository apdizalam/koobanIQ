import { AppError } from './errors.js';
import { LANGUAGES, type Language } from '../models/User.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;

/** Checks the register body; throws 400 VALIDATION_ERROR listing each bad field. */
export function parseRegisterBody(body: unknown): {
  email: string;
  password: string;
  preferredLanguage?: Language;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const details: Record<string, string> = {};

  if (typeof b.email !== 'string' || !EMAIL_RE.test(b.email.trim())) {
    details.email = 'Enter a valid email address';
  }
  if (typeof b.password !== 'string' || b.password.length < PASSWORD_MIN) {
    details.password = `Password must be at least ${PASSWORD_MIN} characters`;
  } else if (b.password.length > 128) {
    details.password = 'Password must be at most 128 characters';
  }
  if (
    b.preferredLanguage !== undefined &&
    !(LANGUAGES as readonly unknown[]).includes(b.preferredLanguage)
  ) {
    details.preferredLanguage = 'Must be "en" or "so"';
  }

  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  return {
    email: b.email as string,
    password: b.password as string,
    preferredLanguage: b.preferredLanguage as Language | undefined,
  };
}
