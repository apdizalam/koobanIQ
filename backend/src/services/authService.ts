import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { hashToken, issueRefreshToken, signAccessToken } from '../lib/tokens.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User, toPublicUser, type Language, type UserDocument } from '../models/User.js';
import { sendCode, useCode } from './emailCodeService.js';

export interface RegisterInput {
  email: string;
  password: string;
  preferredLanguage?: Language;
  /** "I am 18 or older", checked by parseRegisterBody. */
  ageConfirmed: true;
}

/**
 * Creates a local (email + password) account with role `user`, then emails a
 * verification code in the account's language. If the email can't be sent the
 * account still exists; the user can ask for a new code.
 */
export async function registerUser(input: RegisterInput) {
  const email = input.email.trim().toLowerCase();
  if (await User.exists({ email })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }
  const user = await User.create({
    email,
    passwordHash: await hashPassword(input.password),
    preferredLanguage: input.preferredLanguage ?? 'en',
    ageConfirmedAt: new Date(),
  });
  // The code is only emailed when confirming the email is required (env.emailVerificationRequired).
  if (env.emailVerificationRequired) {
    try {
      await sendCode(user, 'verifyEmail');
    } catch (err) {
      console.error('Verification email failed:', err instanceof Error ? err.message : err);
    }
  }
  return toPublicUser(user);
}

const normalise = (email: string) => email.trim().toLowerCase();

/**
 * Confirms the email address with the emailed code. Already verified: returns
 * the user unchanged. Unknown email gets the same INVALID_CODE answer as a wrong
 * code, so nobody can find out which emails have accounts.
 */
export async function verifyEmail(input: { email: string; code: string }) {
  const user = await User.findOne({ email: normalise(input.email) });
  if (!user) {
    throw new AppError(400, 'INVALID_CODE', 'The code is wrong or has expired. Ask for a new one');
  }
  if (user.emailVerified) return toPublicUser(user);
  await useCode(user._id, 'verifyEmail', input.code);
  user.emailVerified = true;
  await user.save();
  return toPublicUser(user);
}

/** Sends a new verification code if the account exists and isn't verified yet. Always "ok". */
export async function resendVerification(input: { email: string }) {
  const user = await User.findOne({ email: normalise(input.email) });
  if (!user || user.emailVerified || user.status !== 'active') return;
  await sendCode(user, 'verifyEmail');
}

/**
 * Emails a password-reset code to an active local account. Always "ok", even for
 * unknown emails, so nobody can find out which emails have accounts.
 */
export async function forgotPassword(input: { email: string }) {
  const user = await User.findOne({ email: normalise(input.email) });
  if (!user || user.status !== 'active' || user.authProvider !== 'local') return;
  await sendCode(user, 'resetPassword');
}

/**
 * Sets a new password with the emailed code. Every existing session is ended
 * (all refresh tokens revoked), so a stolen session stops working. Using the
 * code also proves the email address, so the account becomes verified.
 */
export async function resetPassword(input: { email: string; code: string; password: string }) {
  const user = await User.findOne({ email: normalise(input.email) });
  if (!user || user.status !== 'active') {
    throw new AppError(400, 'INVALID_CODE', 'The code is wrong or has expired. Ask for a new one');
  }
  await useCode(user._id, 'resetPassword', input.code);
  user.passwordHash = await hashPassword(input.password);
  user.emailVerified = true;
  await user.save();
  await RefreshToken.updateMany(
    { userId: user._id, revokedAt: null },
    { revokedAt: new Date(), revokedReason: 'passwordReset' },
  );
}

export interface LoginInput {
  email: string;
  password: string;
  device?: string;
}

/**
 * Checks email + password and account status, then returns a token pair.
 * A wrong email and a wrong password get the same answer, so nobody can
 * find out which emails have accounts.
 */
export async function loginUser(input: LoginInput) {
  const email = input.email.trim().toLowerCase();
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = !!user?.passwordHash && (await verifyPassword(input.password, user.passwordHash));
  if (!user || !ok) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  if (user.status === 'suspended') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
  }

  return startSession(user, input.device);
}

/** Gives a signed-in user a new access token + refresh token pair. */
async function startSession(user: UserDocument, device?: string) {
  user.lastActiveAt = new Date();
  await user.save();

  const access = signAccessToken(user.id as string, user.role);
  const refresh = await issueRefreshToken(user._id, device);
  return {
    user: toPublicUser(user),
    accessToken: access.token,
    /** Seconds until the access token expires. */
    accessTokenExpiresIn: access.expiresIn,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}

const invalidRefresh = () =>
  new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');

/**
 * Swaps a refresh token for a new pair (rotation): each refresh token works once.
 * If an already-used token comes back, someone may have stolen it, so every
 * session of that user is ended and they must log in again.
 */
export async function refreshSession(refreshToken: string, device?: string) {
  const tokenHash = hashToken(refreshToken);
  const now = new Date();

  // Mark the token used in one step, so two requests can't both use it.
  const record = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { revokedAt: now, revokedReason: 'rotated' },
  );

  if (!record) {
    // Only a token that was already swapped counts as stolen; a logged-out one is just invalid.
    const used = await RefreshToken.findOne({ tokenHash, revokedReason: 'rotated' });
    if (used) {
      await RefreshToken.updateMany(
        { userId: used.userId, revokedAt: null },
        { revokedAt: now, revokedReason: 'reuse' },
      );
      throw new AppError(
        401,
        'REFRESH_TOKEN_REUSED',
        'This session was ended for safety. Please log in again',
      );
    }
    throw invalidRefresh();
  }

  const user = await User.findById(record.userId);
  if (!user) throw invalidRefresh();
  if (user.status === 'suspended') {
    throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
  }
  return startSession(user, device);
}

/** Ends one session. Always succeeds, so logging out twice is harmless. */
export async function logoutSession(refreshToken: string) {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(refreshToken), revokedAt: null },
    { revokedAt: new Date(), revokedReason: 'logout' },
  );
}
