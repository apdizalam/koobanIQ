/* eslint-disable import/no-unresolved, import/namespace, import/no-duplicates --
   expo-router/testing-library is published through the package "exports" map, which the
   lint import resolver cannot follow; TypeScript and Jest resolve it fine. */
import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import i18n from '../src/i18n';
import { session, user } from './support/fakeApi';

const mockSecureStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));
// The phone is in Somalia's time zone.
jest.mock('expo-localization', () => ({
  ...jest.requireActual('expo-localization'),
  getCalendars: () => [{ timeZone: 'Africa/Mogadishu' }],
}));

const EMAIL = 'amina@example.com';
type Reply = { status: number; body?: unknown };
const ok = (data: unknown): Reply => ({ status: 200, body: { data, error: null } });

const counts = (n: number, avg: number | null) => ({
  start: '2026-11-15T21:00:00.000Z',
  end: '2026-11-22T21:00:00.000Z',
  quizzes: { finished: n, averageScorePercent: avg },
  interviews: { finished: n, answers: n * 5, averageScore: avg === null ? null : 6.4 },
  cvs: { created: n + 1, approved: n, exported: 0 },
  jobs: { jobAdsSaved: 2, searches: 3, jobsFound: 41, saved: 4, scored: 20, recommended: 7 },
});

const calls: string[] = [];
let failReports = false;

beforeEach(() => {
  mockSecureStore.clear();
  mockSecureStore.set('kobaniq.refreshToken', 'saved-1');
  calls.length = 0;
  failReports = false;
  globalThis.fetch = jest.fn(async (url: string) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace('/api/v1', '');
    calls.push(path + parsed.search);
    let reply: Reply | null = null;
    if (path === '/auth/refresh') reply = ok(session(EMAIL));
    else if (path === '/me') reply = ok({ user: user(EMAIL) });
    else if (path === '/cvs') reply = ok({ cvs: [] });
    else if (path === '/job-descriptions') reply = ok({ jobDescriptions: [] });
    else if (path === '/skills')
      reply = ok({ skills: [], counts: { total: 0, assessed: 0, selfReported: 0 } });
    else if (path === '/reports' && !failReports) {
      const period = parsed.searchParams.get('period');
      reply = ok({
        report: {
          period,
          timeZone: parsed.searchParams.get('tz'),
          generatedAt: '2026-11-20T10:00:00.000Z',
          current: counts(period === 'day' ? 1 : 2, 80),
          previous: counts(0, null),
        },
      });
    }
    if (!reply) throw new TypeError('Network request failed');
    return {
      ok: reply.status < 400,
      status: reply.status,
      json: async () => reply.body,
    } as Response;
  }) as unknown as typeof fetch;
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

async function openReports() {
  await act(async () => {
    renderRouter('./src/app', { initialUrl: '/reports' });
  });
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
  expect(screen.getByTestId('reports-screen')).toBeTruthy();
}
const press = (testID: string) =>
  act(async () => {
    fireEvent.press(screen.getByTestId(testID));
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });

describe('TIQ-20: Reports tab', () => {
  it('shows this week next to last week, asked for in the phone’s time zone', async () => {
    await openReports();
    expect(calls).toContain('/reports?period=week&tz=Africa%2FMogadishu');
    expect(screen.getByTestId('reports-quizzes-finished-now').props.children).toBe('2');
    expect(screen.getByTestId('reports-quizzes-average-now').props.children).toBe('80%');
    expect(screen.getByTestId('reports-interviews-average-now').props.children).toBe('6.4/10');
    expect(screen.getByTestId('reports-jobs-found-now').props.children).toBe('41');
    // Nothing to average last week: a dash, never "0".
    expect(screen.getAllByText('Last week: —').length).toBeGreaterThan(0);
    expect(screen.getByTestId('reports-note').props.children).toMatch(
      /nothing is estimated\. Applications are not counted.*\(Africa\/Mogadishu\)/,
    );
  });

  it('changing the period asks for that period', async () => {
    await openReports();
    await press('reports-period-day');
    expect(calls).toContain('/reports?period=day&tz=Africa%2FMogadishu');
    expect(screen.getByTestId('reports-quizzes-finished-now').props.children).toBe('1');
    expect(screen.getAllByText(/^Yesterday: /).length).toBeGreaterThan(0);
  });

  it('says so when the report cannot be loaded; Somali texts', async () => {
    failReports = true;
    await openReports();
    expect(
      screen.getByText('Your report could not be loaded. Pull down to try again.'),
    ).toBeTruthy();
    await act(async () => {
      await i18n.changeLanguage('so');
    });
    expect(screen.getByText('Toddobaadkan')).toBeTruthy();
  });
});
