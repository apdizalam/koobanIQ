import { API_BASE_URL } from '../constants/api';
import i18n from '../i18n';

/** An error answer from the API ({ error: { code, message } }) or a network failure. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface Envelope<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

/**
 * Calls the KOBANIQ API and returns `data`. Sends the app language
 * (Accept-Language) so server messages come back in it. Throws ApiError;
 * status 0 + NETWORK_ERROR when the server can't be reached.
 */
export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Accept-Language': i18n.language };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server');
  }

  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.error) {
    throw new ApiError(
      res.status,
      json?.error?.code ?? 'UNKNOWN_ERROR',
      json?.error?.message ?? 'Request failed',
    );
  }
  return json.data as T;
}
