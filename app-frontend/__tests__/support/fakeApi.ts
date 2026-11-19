/**
 * Shared test helpers: a fake KOBANIQ API (answers by "METHOD /path", records
 * every call). Import this file's helpers in tests that render the app.
 */
export type Reply = { status: number; body?: unknown };

export const ok = (data: unknown, status = 200): Reply => ({
  status,
  body: { data, error: null },
});
export const fail = (status: number, code: string): Reply => ({
  status,
  body: { data: null, error: { code, message: code } },
});

export const routes: Record<string, Reply | 'offline'> = {};
export const calls: { route: string; body: unknown }[] = [];

/** Clears routes and calls, and installs the fake fetch. Call in beforeEach. */
export function resetFakeApi() {
  for (const key of Object.keys(routes)) delete routes[key];
  calls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const route = `${init.method ?? 'GET'} ${new URL(url).pathname.replace('/api/v1', '')}`;
    calls.push({ route, body: init.body ? JSON.parse(init.body as string) : undefined });
    const reply = routes[route];
    if (!reply || reply === 'offline') throw new TypeError('Network request failed');
    return {
      ok: reply.status < 400,
      status: reply.status,
      json: async () => reply.body,
    } as Response;
  }) as unknown as typeof fetch;
}

export const user = (email: string, preferredLanguage = 'en', emailVerified = true) => ({
  id: 'u1',
  email,
  role: 'user',
  status: 'active',
  emailVerified,
  // Like the server with EMAIL_VERIFICATION_REQUIRED on: unconfirmed accounts confirm first.
  mustVerifyEmail: !emailVerified,
  preferredLanguage,
  createdAt: '2026-11-17T00:00:00.000Z',
});

export const session = (email: string, preferredLanguage = 'en', emailVerified = true) => ({
  user: user(email, preferredLanguage, emailVerified),
  accessToken: 'access-1',
  accessTokenExpiresIn: 900,
  refreshToken: 'refresh-1',
  refreshTokenExpiresAt: '2026-12-17T00:00:00.000Z',
});
