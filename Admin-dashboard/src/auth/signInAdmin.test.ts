import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from '../constants/api';
import { ApiError } from '../services/api';
import { signInAdmin } from './signInAdmin';

const session = {
  user: { id: 'u1', email: 'admin@example.com', role: 'admin' },
  accessToken: 'access-1',
  accessTokenExpiresIn: 900,
  refreshToken: 'refresh-1',
  refreshTokenExpiresAt: '2026-12-17T00:00:00.000Z',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const ok = (data: unknown) => json(200, { data, error: null, meta: {} });
const fail = (status: number, code: string) =>
  json(status, { data: null, error: { code, message: code }, meta: {} });

/** Fakes the API: each call to fetch gets the next answer in the list. */
function mockApi(...answers: (Response | Error)[]) {
  const fetchMock = vi.fn(async () => {
    const next = answers.shift();
    if (!next) throw new Error('unexpected fetch');
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signInAdmin', () => {
  it('lets an admin in: login, then the admin access check', async () => {
    const fetchMock = mockApi(ok(session), ok({ access: true, user: session.user }));

    await expect(signInAdmin('admin@example.com', 'pw')).resolves.toEqual(session);

    expect(fetchMock).toHaveBeenNthCalledWith(1, `${API_BASE_URL}/auth/login`, expect.anything());
    const [accessUrl, accessInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(accessUrl).toBe(`${API_BASE_URL}/admin/access`);
    expect((accessInit.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('signs a non-admin out (revokes the refresh token) and reports NO_ACCESS', async () => {
    const fetchMock = mockApi(
      ok(session),
      fail(403, 'FORBIDDEN'),
      new Response(null, { status: 204 }),
    );

    await expect(signInAdmin('user@example.com', 'pw')).rejects.toMatchObject({
      status: 403,
      code: 'NO_ACCESS',
    });

    const [logoutUrl, logoutInit] = fetchMock.mock.calls[2] as unknown as [string, RequestInit];
    expect(logoutUrl).toBe(`${API_BASE_URL}/auth/logout`);
    expect(JSON.parse(logoutInit.body as string)).toEqual({ refreshToken: 'refresh-1' });
  });

  it('passes a wrong password through as INVALID_CREDENTIALS', async () => {
    mockApi(fail(401, 'INVALID_CREDENTIALS'));
    await expect(signInAdmin('admin@example.com', 'wrong')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('reports NETWORK_ERROR when the server cannot be reached', async () => {
    mockApi(new TypeError('Failed to fetch'));
    const err = await signInAdmin('admin@example.com', 'pw').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
