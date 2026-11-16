import { AppError } from '../lib/errors.js';
import { hashPassword } from '../lib/password.js';
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
