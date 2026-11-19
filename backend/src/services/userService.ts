import { AppError } from '../lib/errors.js';
import { User, toPublicUser } from '../models/User.js';

/** Gives an existing account the `admin` role. Safe to run twice. */
/**
 * Server command only (npm run admin:super): gives an existing admin the
 * super admin rights. Never reachable through the API.
 */
export async function promoteToSuperAdmin(email: string) {
  const user = await User.findOneAndUpdate(
    { email: email.trim().toLowerCase(), role: 'admin' },
    { superAdmin: true },
    { returnDocument: 'after' },
  );
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', `No admin account with email ${email}`);
  }
  return toPublicUser(user);
}

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
