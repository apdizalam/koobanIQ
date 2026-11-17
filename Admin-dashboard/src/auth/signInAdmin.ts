import { ApiError } from '../services/api';
import { checkAdminAccess, login, logout } from '../services/authApi';
import type { Session } from '../types/auth';

/**
 * Logs in with the shared auth endpoint, then asks the API whether this
 * account is an admin. A non-admin is logged out straight away (its refresh
 * token is revoked) and gets ApiError NO_ACCESS.
 */
export async function signInAdmin(email: string, password: string): Promise<Session> {
  const session = await login(email, password);
  try {
    await checkAdminAccess(session.accessToken);
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      await logout(session.refreshToken).catch(() => undefined);
      throw new ApiError(403, 'NO_ACCESS', 'This account is not an admin');
    }
    throw err;
  }
  return session;
}
