import { ApiError } from '../services/api';

/** Message keys under mobile.auth.errors for request failures. */
export type RequestErrorKey =
  'invalidCredentials' | 'emailTaken' | 'suspended' | 'network' | 'generic';

/** Which message to show for a failed login / sign-up request. */
export function requestErrorKey(err: unknown): RequestErrorKey {
  if (!(err instanceof ApiError)) return 'generic';
  switch (err.code) {
    case 'INVALID_CREDENTIALS':
      return 'invalidCredentials';
    case 'EMAIL_TAKEN':
      return 'emailTaken';
    case 'ACCOUNT_SUSPENDED':
      return 'suspended';
    case 'NETWORK_ERROR':
      return 'network';
    default:
      return 'generic';
  }
}
