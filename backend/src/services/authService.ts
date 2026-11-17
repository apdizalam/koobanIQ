import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { hashToken, issueRefreshToken, signAccessToken } from '../lib/tokens.js';
import { RefreshToken } from '../models/RefreshToken.js';
import { User, toPublicUser, type Language, type UserDocument } from '../models/User.js';

export interface RegisterInput {
  email: string;
  password: string;
  preferredLanguage?: Language;
}

/** Creates a local (email + password) account with role `user`. */
export async function registerUser(input: RegisterInput) {
  const email = input.email.trim().toLowerCase();
  if (await User.exists({ email })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }
  const user = await User.create({
    email,
    passwordHash: await hashPassword(input.password),
    preferredLanguage: input.preferredLanguage ?? 'en',
  });
  return toPublicUser(user);
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
