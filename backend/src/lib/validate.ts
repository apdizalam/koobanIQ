import { AppError } from './errors.js';
import { LANGUAGES, type Language } from '../models/User.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

// Field messages are keys under server.validation in the shared translation files;
// the error handler turns them into text in the request's language.

/** Checks the register body; throws 400 VALIDATION_ERROR listing each bad field. */
export function parseRegisterBody(body: unknown): {
  email: string;
  password: string;
  preferredLanguage?: Language;
  ageConfirmed: true;
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
  // "I am 18 or older" must be ticked: exactly true, never a string or a missing field.
  if (b.ageConfirmed !== true) details.ageConfirmed = 'ageConfirmRequired';

  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  return {
    email: b.email as string,
    password: b.password as string,
    preferredLanguage: b.preferredLanguage as Language | undefined,
    ageConfirmed: true,
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

const CODE_RE = /^\d{6}$/;

function emailField(b: Record<string, unknown>, details: Record<string, string>): string {
  if (typeof b.email !== 'string' || !EMAIL_RE.test(b.email.trim())) {
    details.email = 'emailInvalid';
    return '';
  }
  return b.email;
}

function codeField(b: Record<string, unknown>, details: Record<string, string>): string {
  const code = typeof b.code === 'string' ? b.code.trim() : '';
  if (!CODE_RE.test(code)) details.code = 'codeInvalid';
  return code;
}

function fail(details: Record<string, string>) {
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
}

/** Checks `{ email }` (resend verification code, forgot password). */
export function parseEmailBody(body: unknown): { email: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  const email = emailField(b, details);
  fail(details);
  return { email };
}

/** Checks `{ email, code }` (verify email). The code is 6 digits. */
export function parseVerifyEmailBody(body: unknown): { email: string; code: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  const email = emailField(b, details);
  const code = codeField(b, details);
  fail(details);
  return { email, code };
}

/** Checks `{ email, code, password }` (reset password with the emailed code). */
export function parseResetPasswordBody(body: unknown): {
  email: string;
  code: string;
  password: string;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  const email = emailField(b, details);
  const code = codeField(b, details);
  if (typeof b.password !== 'string' || b.password.length < PASSWORD_MIN) {
    details.password = 'passwordTooShort';
  } else if (b.password.length > PASSWORD_MAX) {
    details.password = 'passwordTooLong';
  }
  fail(details);
  return { email, code, password: b.password as string };
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

/**
 * Checks the "Continue with Google" finish body (TIQ-39): the one-time code from
 * the return link, plus "I am 18 or older" and the language for a new account.
 */
export function parseGoogleCompleteBody(body: unknown): {
  code: string;
  ageConfirmed?: boolean;
  preferredLanguage?: Language;
} {
  const b = (body ?? {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  if (typeof b.code !== 'string' || b.code.length < 20 || b.code.length > 200) {
    details.code = 'codeInvalid';
  }
  if (b.ageConfirmed !== undefined && typeof b.ageConfirmed !== 'boolean') {
    details.ageConfirmed = 'ageConfirmRequired';
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
    code: b.code as string,
    ageConfirmed: b.ageConfirmed as boolean | undefined,
    preferredLanguage: b.preferredLanguage as Language | undefined,
  };
}
