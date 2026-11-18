import { ApiError } from '../services/api';

/** Message keys under mobile.auth.errors for request failures. */
export type RequestErrorKey =
  | 'invalidCredentials'
  | 'emailTaken'
  | 'suspended'
  | 'invalidCode'
  | 'tooManyAttempts'
  | 'network'
  | 'generic';

/** Which message to show for a failed auth request (login, sign-up, codes). */
export function requestErrorKey(err: unknown): RequestErrorKey {
  if (!(err instanceof ApiError)) return 'generic';
  switch (err.code) {
    case 'INVALID_CREDENTIALS':
      return 'invalidCredentials';
    case 'EMAIL_TAKEN':
      return 'emailTaken';
    case 'ACCOUNT_SUSPENDED':
      return 'suspended';
    case 'INVALID_CODE':
      return 'invalidCode';
    case 'TOO_MANY_ATTEMPTS':
      return 'tooManyAttempts';
    case 'NETWORK_ERROR':
      return 'network';
    default:
      return 'generic';
  }
}
