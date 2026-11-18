import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { translate } from '../lib/i18n.js';
import { sendEmail } from '../lib/mailer.js';
import { EmailCode, type EmailCodePurpose } from '../models/EmailCode.js';
import type { Language } from '../models/User.js';

/** A code works for 15 minutes. */
export const CODE_TTL_MINUTES = 15;
/** After 5 wrong guesses the code stops working (a 6-digit code can't be guessed in 5 tries). */
export const MAX_CODE_ATTEMPTS = 5;
/** A new code can be requested at most once a minute. */
export const RESEND_COOLDOWN_SECONDS = 60;

interface CodeOwner {
  _id: Types.ObjectId;
  email: string;
  preferredLanguage: Language;
}

const hashCode = (userId: Types.ObjectId, purpose: EmailCodePurpose, code: string) =>
  createHash('sha256').update(`${userId.toString()}:${purpose}:${code}`).digest();

const invalidCode = () =>
  new AppError(400, 'INVALID_CODE', 'The code is wrong or has expired. Ask for a new one');
const tooManyAttempts = () =>
  new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong codes. Ask for a new one');

/**
 * Makes a new 6-digit code, replaces any earlier one for the same purpose, and
 * emails it in the user's language. Returns false (and sends nothing) when the
 * previous code was sent less than RESEND_COOLDOWN_SECONDS ago.
 */
export async function sendCode(user: CodeOwner, purpose: EmailCodePurpose): Promise<boolean> {
  const latest = await EmailCode.findOne({ userId: user._id, purpose }).sort({ createdAt: -1 });
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
    return false;
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  await EmailCode.deleteMany({ userId: user._id, purpose });
  await EmailCode.create({
    userId: user._id,
    purpose,
    codeHash: hashCode(user._id, purpose, code).toString('hex'),
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
  });

  const language = user.preferredLanguage;
  const vars = { code, minutes: CODE_TTL_MINUTES };
  await sendEmail({
    to: user.email,
    subject: translate(language, `server.email.${purpose}.subject`) ?? 'KOBANIQ',
    text: translate(language, `server.email.${purpose}.body`, vars) ?? code,
  });
  return true;
}

/**
 * Checks a code and uses it up. Throws 400 INVALID_CODE (wrong, expired, used,
 * replaced) or 429 TOO_MANY_ATTEMPTS. Wrong guesses are counted.
 */
export async function useCode(
  userId: Types.ObjectId,
  purpose: EmailCodePurpose,
  code: string,
): Promise<void> {
  const now = new Date();
  const record = await EmailCode.findOne({
    userId,
    purpose,
    consumedAt: null,
    expiresAt: { $gt: now },
  }).sort({ createdAt: -1 });
  if (!record) throw invalidCode();
  if (record.attempts >= MAX_CODE_ATTEMPTS) throw tooManyAttempts();

  const expected = Buffer.from(record.codeHash, 'hex');
  const given = hashCode(userId, purpose, code);
  if (!timingSafeEqual(expected, given)) {
    const updated = await EmailCode.findOneAndUpdate(
      { _id: record._id },
      { $inc: { attempts: 1 } },
      { new: true },
    );
    if (updated && updated.attempts >= MAX_CODE_ATTEMPTS) throw tooManyAttempts();
    throw invalidCode();
  }

  // Use it up in one step, so the same code can't succeed twice at the same time.
  const used = await EmailCode.findOneAndUpdate(
    { _id: record._id, consumedAt: null, attempts: { $lt: MAX_CODE_ATTEMPTS } },
    { consumedAt: now },
  );
  if (!used) throw invalidCode();
}
