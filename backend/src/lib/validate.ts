import { AppError } from './errors.js';
import { LANGUAGES, type Language } from '../models/User.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

// Field messages are keys under server.validation in the shared translation files;
// the error handler turns them into text in the request's language.

/** Checks the register body; throws 400 VALIDATION_ERROR listing each bad field. */
export function parseRegisterBody(body: unknown): {
  email: string;
  password: string;
  preferredLanguage?: Language;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const details: Record<string, string> = {};

  if (typeof b.email !== 'string' || !EMAIL_RE.test(b.email.trim())) {
    details.email = 'emailInvalid';
  }
  if (typeof b.password !== 'string' || b.password.length < PASSWORD_MIN) {
    details.password = 'passwordTooShort';
  } else if (b.password.length > PASSWORD_MAX) {
    details.password = 'passwordTooLong';
  }
  if (
    b.preferredLanguage !== undefined &&
    !(LANGUAGES as readonly unknown[]).includes(b.preferredLanguage)
  ) {
    details.preferredLanguage = 'languageInvalid';
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

/** Checks the login body; throws 400 VALIDATION_ERROR listing each missing field. */
export function parseLoginBody(body: unknown): { email: string; password: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  if (typeof b.email !== 'string' || b.email.trim() === '') {
    details.email = 'emailRequired';
  }
  if (typeof b.password !== 'string' || b.password === '') {
    details.password = 'passwordRequired';
  }
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  return { email: b.email as string, password: b.password as string };
}

/** Checks a body that carries `{ refreshToken }` (refresh and logout). */
export function parseRefreshBody(body: unknown): { refreshToken: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.refreshToken !== 'string' || b.refreshToken === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      refreshToken: 'refreshTokenRequired',
    });
  }
  return { refreshToken: b.refreshToken };
}
