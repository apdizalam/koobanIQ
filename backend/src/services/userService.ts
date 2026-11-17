import { AppError } from '../lib/errors.js';
import { User, toPublicUser } from '../models/User.js';

/** Gives an existing account the `admin` role. Safe to run twice. */
export async function promoteToAdmin(email: string) {
  const user = await User.findOneAndUpdate(
    { email: email.trim().toLowerCase() },
    { role: 'admin' },
    { new: true },
  );
  if (!user) {
    throw new AppError(404, 'USER_NOT_FOUND', `No account with email ${email}`);
  }
  return toPublicUser(user);
}
