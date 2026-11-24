import { AppError } from '../lib/errors.js';
import { hashPassword } from '../lib/password.js';
import { EMAIL_RE, PASSWORD_MAX } from '../lib/validate.js';
import { User, toPublicUser } from '../models/User.js';

/** Gives an existing account the `admin` role. Safe to run twice. */
export async function promoteToAdmin(email: string) {
  const user = await User.findOneAndUpdate(
    { email: email.trim().toLowerCase() },
    { role: 'admin' },
    { returnDocument: 'after' },
  );
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', `No account with email ${email}`);
  }
  return toPublicUser(user);
}

/** Admins need a longer password than the 8 characters normal accounts need. */
export const ADMIN_PASSWORD_MIN = 12;

/**
 * Makes sure an admin account exists (TIQ-25, for a new database such as
 * staging): creates it with this email and password, or gives an existing
 * account the admin role. An existing account keeps its password unless
 * `resetPassword` is true. Never logs or returns the password.
 */
export async function ensureAdminAccount(input: {
  email: string;
  password: string;
  resetPassword?: boolean;
}) {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('ADMIN_EMAIL is not a valid email address');
  if (input.password.length < ADMIN_PASSWORD_MIN || input.password.length > PASSWORD_MAX) {
    throw new Error(
      `ADMIN_PASSWORD must be ${ADMIN_PASSWORD_MIN} to ${PASSWORD_MAX} characters long`,
    );
  }
  const existing = await User.findOne({ email });
  if (!existing) {
    const user = await User.create({
      email,
      passwordHash: await hashPassword(input.password),
      role: 'admin',
      emailVerified: true,
      ageConfirmedAt: new Date(),
    });
    return { action: 'created' as const, user: toPublicUser(user) };
  }
  existing.role = 'admin';
  if (input.resetPassword) existing.passwordHash = await hashPassword(input.password);
  await existing.save();
  return {
    action: input.resetPassword ? ('promoted, password reset' as const) : ('promoted' as const),
    user: toPublicUser(existing),
  };
}
