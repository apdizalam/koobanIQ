/* eslint-disable import/no-unresolved, import/namespace, import/no-duplicates --
   expo-router/testing-library is published through the package "exports" map, which the
   lint import resolver cannot follow; TypeScript and Jest resolve it fine. */
import { act, fireEvent } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
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

/** The app's Expo project id (set by eas init); none unless a test sets it. */
let mockProjectId: string | null = null;
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { eas: { projectId: mockProjectId ?? undefined } } };
    },
    easConfig: null,
  },
}));

const EMAIL = 'amina@example.com';
type Reply = { status: number; body?: unknown };
const ok = (data: unknown, status = 200): Reply => ({ status, body: { data, error: null } });

const item = (id: string, jobId: string, read = false) => ({
  id,
  type: 'strong_match',
  jobId,
  values: { title: 'Data Officer', employer: 'Example Relief Partnership', score: 82 },
  read,
  createdAt: '2026-11-21T07:00:00.000Z',
});
const JOB = {
  job: {
    id: 'j1',
    sourceKey: 'career-pages',
    applyUrl: 'https://jobs.example.invalid/j1',
    sources: [],
    title: 'Data Officer',
    employer: 'Example Relief Partnership',
    employerType: 'ngo',
    region: 'somaliland',
    city: 'Hargeisa',
    jobType: null,
    workMode: null,
    deadline: null,
    postedAt: null,
    language: 'en',
    description: null,
    firstSeenAt: '2026-11-21T06:00:00.000Z',
    lastSeenAt: '2026-11-21T06:00:00.000Z',
  },
  match: {
    score: 82,
    category: 'strong',
    recommended: true,
    matchedSkills: [],
    missingRequired: [],
    missingPreferred: [],
    userLevel: 'junior',
    levelConfidence: 'confident',
    jobLevel: 'junior',
    levelFit: 'fits',
    relevantYears: 2,
    requiredYears: 2,
    reasons: [],
  },
  saved: false,
};

const announcement = (id: string, read = false) => ({
  id,
  type: 'announcement',
  jobId: null,
  message: {
    title: { en: 'New job sources', so: 'Ilo shaqo oo cusub' },
    body: {
      en: 'KOBANIQ now searches more career pages.',
      so: 'KOBANIQ hadda wuxuu raadiyaa bogag badan.',
    },
  },
  read,
  createdAt: '2026-11-22T07:00:00.000Z',
});

let items: (ReturnType<typeof item> | ReturnType<typeof announcement>)[];
let settings: { push: boolean; email: boolean; emailAvailable: boolean };
const calls: { route: string; body: unknown }[] = [];

beforeEach(() => {
  mockSecureStore.clear();
  mockSecureStore.set('kobaniq.refreshToken', 'saved-1');
  items = [item('n1', 'j1'), item('n2', 'j2', true)];
  settings = { push: true, email: true, emailAvailable: false };
  calls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname.replace('/api/v1', '');
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ route: `${method} ${path}`, body });
    let reply: Reply | null = null;
    if (path === '/auth/refresh') reply = ok(session(EMAIL));
    else if (path === '/me') reply = ok({ user: user(EMAIL) });
    else if (path === '/cvs') reply = ok({ cvs: [] });
    else if (path === '/job-descriptions') reply = ok({ jobDescriptions: [] });
    else if (path === '/skills')
      reply = ok({ skills: [], counts: { total: 0, assessed: 0, selfReported: 0 } });
    else if (path === '/notifications')
      reply = ok({ notifications: items, unread: items.filter((n) => !n.read).length });
    else if (path === '/notifications/settings' && method === 'GET') reply = ok({ settings });
    else if (path === '/notifications/settings') {
      settings = { ...settings, ...body };
      reply = ok({ settings });
    } else if (/^\/notifications\/[^/]+\/read$/.test(path)) {
      const n = items.find((x) => path === `/notifications/${x.id}/read`)!;
      n.read = true;
      reply = ok({ notification: n });
    } else if (path === '/notifications/push-token') reply = { status: 204 };
    else if (path === '/jobs/j1') reply = ok(JOB);
    else if (path === '/jobs/saved') reply = ok({ jobs: [] });
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

async function open(url: string, ready: string) {
  await act(async () => {
    renderRouter('./src/app', { initialUrl: url });
  });
  await act(async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
  expect(screen.getByTestId(ready)).toBeTruthy();
}
const press = (testID: string) =>
  act(async () => {
    fireEvent.press(screen.getByTestId(testID));
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });

describe('TIQ-22: notifications', () => {
  it('Home shows the unread count; the list opens the job and marks it read', async () => {
    await open('/home', 'home-notifications');
    expect(screen.getByTestId('home-notifications-badge')).toBeTruthy();
    await press('home-notifications');
    expect(screen.getByTestId('notification-n1')).toBeTruthy();
    expect(screen.getAllByText('Strong match · 82%').length).toBe(2);
    await press('notification-n1');
    expect(calls.some((c) => c.route === 'POST /notifications/n1/read')).toBe(true);
    expect(screen).toHavePathname('/job/j1');
  });

  it('turning push off is saved; notes say when push or email are not available yet', async () => {
    await open('/notifications', 'notify-push');
    // No Expo project id in this build, and the server has email off.
    expect(screen.getByTestId('notify-push-unavailable')).toBeTruthy();
    expect(screen.getByTestId('notify-email-unavailable')).toBeTruthy();
    await press('notify-push');
    expect(calls.find((c) => c.route === 'PUT /notifications/settings')!.body).toEqual({
      push: false,
    });
    expect(screen.getByTestId('notify-push').props.accessibilityState).toMatchObject({
      checked: false,
    });
  });

  it('End Test: tapping a push opens the right job', async () => {
    await open('/home', 'home-notifications');
    const listener = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock
      .calls[0][0];
    await act(async () => {
      listener({ notification: { request: { content: { data: { jobId: 'j1' } } } } });
      for (let i = 0; i < 30; i += 1) await Promise.resolve();
    });
    expect(screen).toHavePathname('/job/j1');
  });

  it('TIQ-33: an announcement shows in the app language; tapping it marks it read', async () => {
    items = [announcement('a1'), ...items];
    await open('/notifications', 'notification-a1');
    expect(screen.getByText('Announcement')).toBeTruthy();
    expect(screen.getByText('New job sources')).toBeTruthy();
    expect(screen.getByText('KOBANIQ now searches more career pages.')).toBeTruthy();
    await press('notification-a1');
    expect(calls.some((c) => c.route === 'POST /notifications/a1/read')).toBe(true);
    expect(screen).toHavePathname('/notifications');

    await act(async () => {
      await i18n.changeLanguage('so');
    });
    expect(screen.getByText('Ogeysiis')).toBeTruthy();
    expect(screen.getByText('Ilo shaqo oo cusub')).toBeTruthy();
    expect(screen.getByText('KOBANIQ hadda wuxuu raadiyaa bogag badan.')).toBeTruthy();
  });

  it('TIQ-33: tapping an announcement push opens the notifications list', async () => {
    await open('/home', 'home-notifications');
    const listener = (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock
      .calls[0][0];
    await act(async () => {
      listener({
        notification: {
          request: { content: { data: { type: 'announcement', notificationId: 'a1' } } },
        },
      });
      for (let i = 0; i < 30; i += 1) await Promise.resolve();
    });
    expect(screen).toHavePathname('/notifications');
  });

  it('with a project id and permission, this phone is registered for push', async () => {
    mockProjectId = 'test-project';
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: true });
    await open('/home', 'home-notifications');
    expect(calls.find((c) => c.route === 'POST /notifications/push-token')!.body).toEqual({
      token: 'ExponentPushToken[test-phone-0001]',
      platform: 'ios',
    });
    mockProjectId = null;
  });
});
