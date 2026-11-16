import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { issueRefreshToken, signAccessToken } from '../lib/tokens.js';
import { User, toPublicUser, type Language } from '../models/User.js';

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

  user.lastActiveAt = new Date();
  await user.save();

  const access = signAccessToken(user.id as string, user.role);
  const refresh = await issueRefreshToken(user._id, input.device);
  return {
    user: toPublicUser(user),
    accessToken: access.token,
    /** Seconds until the access token expires. */
    accessTokenExpiresIn: access.expiresIn,
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
  };
}
