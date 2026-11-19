import type { TFunction } from 'i18next';
import { ApiError } from '../services/api';

/**
 * Text for a failed AI request (reading a job ad, writing a CV). The server
 * already explains its refusals in the app language (not a job ad, AI busy,
 * free limit reached…), so its message is shown; network problems and
 * unexpected failures get the app's own text.
 */
export function aiErrorText(err: unknown, t: TFunction): string {
  if (!(err instanceof ApiError)) return t('mobile.auth.errors.generic');
  if (err.code === 'NETWORK_ERROR') return t('mobile.cv.errors.network');
  if (err.code === 'UNKNOWN_ERROR' || err.status === 401) return t('mobile.auth.errors.generic');
  const fields = Object.values(err.details);
  return fields.length > 0 ? fields.join(' ') : err.message;
}
