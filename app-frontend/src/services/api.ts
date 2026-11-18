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
 * Longest wait for an answer. Without a limit, a server the phone cannot reach
 * (wrong Wi-Fi, router blocking devices, server off) leaves the request — and
 * the button spinner — hanging for minutes.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Calls the KOBANIQ API and returns `data`. Sends the app language
 * (Accept-Language) so server messages come back in it. Throws ApiError;
 * status 0 + NETWORK_ERROR when the server can't be reached or doesn't
 * answer within REQUEST_TIMEOUT_MS.
 */
export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; accessToken?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Accept-Language': i18n.language };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  let json: Envelope<T> | null;
  try {
    try {
      res = await fetch(`${API_BASE_URL}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server');
    }
    if (res.status === 204) return undefined as T;
    // Reading the body is inside the time limit too.
    json = (await res.json().catch(() => null)) as Envelope<T> | null;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok || !json || json.error) {
    throw new ApiError(
      res.status,
      json?.error?.code ?? 'UNKNOWN_ERROR',
      json?.error?.message ?? 'Request failed',
    );
  }
  return json.data as T;
}
