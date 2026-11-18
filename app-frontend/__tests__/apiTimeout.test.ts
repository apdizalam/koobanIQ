import { ApiError, REQUEST_TIMEOUT_MS, apiRequest } from '../src/services/api';
import { requestErrorKey } from '../src/auth/errorKey';

/** A server the phone cannot reach: the request never answers until it is aborted. */
function silentServer() {
  return jest.fn(
    (_url: string, init: RequestInit = {}) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }),
  );
}

afterEach(() => {
  jest.useRealTimers();
});

describe('apiRequest time limit', () => {
  it('gives up after REQUEST_TIMEOUT_MS with NETWORK_ERROR instead of hanging', async () => {
    jest.useFakeTimers();
    const fetchMock = silentServer();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const request = apiRequest('/auth/register', { method: 'POST', body: { email: 'a@b.so' } });
    const outcome = request.then(
      () => 'answered',
      (err: unknown) => err,
    );

    // Just before the limit: still waiting.
    await jest.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    let settled = false;
    void outcome.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    // At the limit: the request is aborted and reported as "cannot reach the server".
    await jest.advanceTimersByTimeAsync(1);
    const err = await outcome;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
    expect(requestErrorKey(err)).toBe('network');
    expect(fetchMock.mock.calls[0][1]?.signal).toBeDefined();
  });

  it('a server that answers in time is not affected and leaves no timer behind', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'ok' }, error: null }),
    })) as unknown as typeof fetch;

    await expect(apiRequest<{ status: string }>('/health')).resolves.toEqual({ status: 'ok' });
    expect(jest.getTimerCount()).toBe(0);
  });
});
