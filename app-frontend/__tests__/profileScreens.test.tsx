/* eslint-disable import/no-unresolved, import/namespace, import/no-duplicates --
   expo-router/testing-library is published through the package "exports" map, which the
   lint import resolver cannot follow; TypeScript and Jest resolve it fine. */
import { act, cleanup, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import i18n from '../src/i18n';
import { session, user } from './support/fakeApi';

// Secure storage lives on the phone; here it is a plain in-memory map.
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

const EMAIL = 'amina@example.com';
type Item = { id: string } & Record<string, unknown>;
type Store = {
  personal: Record<string, unknown>;
  experience: Item[];
  education: Item[];
  projects: Item[];
  certifications: Item[];
  languages: Item[];
  preferences: Record<string, string[]>;
};

/**
 * A tiny in-memory profile server with the same answers as the backend
 * (whole profile back after every change). It survives an app "restart".
 */
let store: Store;
let nextId = 1;
let offline = false;
const calls: { route: string; body: unknown }[] = [];

const emptyStore = (): Store => ({
  personal: {},
  experience: [],
  education: [],
  projects: [],
  certifications: [],
  languages: [],
  preferences: {
    titles: [],
    regions: [],
    cities: [],
    employerTypes: [],
    workModes: [],
    jobTypes: [],
  },
});

const completion = (s: Store) =>
  [
    Boolean(s.personal.fullName && s.personal.headline && (s.personal.city || s.personal.region)),
    s.experience.length > 0,
    s.education.length > 0,
    s.languages.length > 0,
    s.preferences.titles.length > 0 || s.preferences.regions.length > 0,
  ].filter(Boolean).length * 20;

const reply = (status: number, body: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;
const profileReply = (status = 200) =>
  reply(status, { data: { profile: { ...store, completion: completion(store) } }, error: null });

const clean = (body: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(body).filter(([, v]) => v !== null));

function profileRoute(method: string, path: string, body: Record<string, unknown>) {
  const [, , section, id] = path.split('/'); // "", "profile", section, id
  if (method === 'GET' && path === '/profile') return profileReply();
  if (method === 'PATCH' && path === '/profile/personal') {
    // Like the server: the CV email must look like an email (it is saved lower-cased).
    const saved = { ...body };
    if (typeof saved.contactEmail === 'string') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(saved.contactEmail)) {
        return reply(400, {
          data: null,
          error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid' },
          meta: { details: { contactEmail: 'Enter a valid email address' } },
        });
      }
      saved.contactEmail = saved.contactEmail.toLowerCase();
    }
    store.personal = clean({ ...store.personal, ...saved });
    return profileReply();
  }
  if (method === 'PUT' && path === '/profile/preferences') {
    store.preferences = { ...store.preferences, ...(body as Record<string, string[]>) };
    return profileReply();
  }
  const list = store[section as 'experience'];
  if (method === 'POST') {
    // Like the server: a missing required field comes back as a field message.
    if (section === 'experience' && !body.employer) {
      return reply(400, {
        data: null,
        error: { code: 'VALIDATION_ERROR', message: 'Some fields are invalid' },
        meta: { details: { employer: 'This field is required' } },
      });
    }
    list.push({ id: `item${nextId++}`, ...clean(body) });
    return profileReply(201);
  }
  const index = list.findIndex((i) => i.id === id);
  if (method === 'PATCH') list[index] = clean({ ...list[index], ...body }) as Item;
  if (method === 'DELETE') list.splice(index, 1);
  return profileReply();
}

beforeEach(() => {
  mockSecureStore.clear();
  mockSecureStore.set('kobaniq.refreshToken', 'saved-1');
  store = emptyStore();
  nextId = 1;
  offline = false;
  calls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname.replace('/api/v1', '');
    const body = init.body ? JSON.parse(init.body as string) : {};
    calls.push({ route: `${method} ${path}`, body });
    if (offline) throw new TypeError('Network request failed');
    if (path === '/auth/refresh') {
      return reply(200, { data: session(EMAIL), error: null });
    }
    if (path === '/me') return reply(200, { data: { user: user(EMAIL) }, error: null });
    if (path.startsWith('/profile')) return profileRoute(method, path, body);
    throw new TypeError('Network request failed');
  }) as unknown as typeof fetch;
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

async function openApp(url = '/profile') {
  await act(async () => {
    renderRouter('./src/app', { initialUrl: url });
  });
}
const press = (testID: string) =>
  act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });
const type = (testID: string, text: string) =>
  act(async () => {
    fireEvent.changeText(screen.getByTestId(testID), text);
  });

describe('TIQ-6: profile screens', () => {
  it('Profile tab shows completion and every part; personal info saves', async () => {
    await openApp();
    expect(await screen.findByTestId('profile-completion')).toHaveTextContent(
      'Profile 0% complete',
    );
    for (const row of [
      'personal',
      'experience',
      'education',
      'projects',
      'certifications',
      'languages',
      'preferences',
    ]) {
      expect(screen.getByTestId(`profile-row-${row}`)).toBeTruthy();
    }

    await press('profile-row-personal');
    expect(screen).toHavePathname('/profile-edit/personal');
    await type('field-fullName', 'Amina Test');
    await type('field-headline', 'QA tester');
    await press('field-region-somaliland');
    await press('personal-form-save');

    expect(calls.find((c) => c.route === 'PATCH /profile/personal')?.body).toMatchObject({
      fullName: 'Amina Test',
      headline: 'QA tester',
      region: 'somaliland',
      phone: null,
    });
    expect(await screen.findByTestId('profile-screen')).toBeTruthy();
    expect(screen.getByText('Amina Test · QA tester')).toBeTruthy();
    expect(screen.getByTestId('profile-completion')).toHaveTextContent('Profile 20% complete');
  });

  it('CV email: its own field with a hint, checked by the server, separate from the login email', async () => {
    await openApp('/profile-edit/personal');
    expect(await screen.findByTestId('personal-form')).toBeTruthy();
    expect(screen.getByText('Email shown on CVs')).toBeTruthy();
    expect(screen.getByText('Shown on your CVs. Your login email does not change.')).toBeTruthy();
    const field = screen.getByTestId('field-contactEmail');
    expect(field.props.keyboardType).toBe('email-address');
    expect(field.props.autoCapitalize).toBe('none');

    await type('field-contactEmail', 'not-an-email');
    await press('personal-form-save');
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(store.personal.contactEmail).toBeUndefined();

    await type('field-contactEmail', ' Amina.CV@Example.com ');
    await press('personal-form-save');
    expect(calls.filter((c) => c.route === 'PATCH /profile/personal').at(-1)?.body).toMatchObject({
      contactEmail: 'Amina.CV@Example.com',
    });
    expect(store.personal.contactEmail).toBe('amina.cv@example.com');
    // Only the profile changes: no account (login email) request was made.
    expect(calls.some((c) => c.route.startsWith('PATCH /me'))).toBe(false);

    // Saved once, shown again next time.
    await openApp('/profile-edit/personal');
    expect((await screen.findByTestId('field-contactEmail')).props.value).toBe(
      'amina.cv@example.com',
    );
  });

  it('experience: add, edit and delete an entry', async () => {
    await openApp();
    await screen.findByTestId('profile-row-experience');
    await press('profile-row-experience');
    expect(await screen.findByText('Nothing added yet.')).toBeTruthy();

    await press('experience-add');
    await type('field-title', 'QA intern');
    await type('field-employer', 'Test company');
    await type('field-startDate', '2024-01');
    await press('experience-form-save');
    expect(calls.find((c) => c.route === 'POST /profile/experience')?.body).toEqual({
      title: 'QA intern',
      employer: 'Test company',
      startDate: '2024-01',
    });
    expect(await screen.findByText('QA intern')).toBeTruthy();
    expect(screen.getByText('Test company · 2024-01 – Now')).toBeTruthy();

    await press('item-item1');
    await type('field-title', 'QA tester');
    await press('experience-form-save');
    expect(await screen.findByText('QA tester')).toBeTruthy();

    await press('item-item1');
    await press('experience-form-delete');
    expect(screen.getByText('Delete this entry? This cannot be undone.')).toBeTruthy();
    await press('experience-form-delete-yes');
    expect(calls.some((c) => c.route === 'DELETE /profile/experience/item1')).toBe(true);
    expect(await screen.findByText('Nothing added yet.')).toBeTruthy();
  });

  it("shows the server's message under the field it is about", async () => {
    await openApp('/profile-edit/experience/new');
    await screen.findByTestId('experience-form');
    await type('field-title', 'QA intern');
    await type('field-startDate', '2024-01');
    await press('experience-form-save');
    expect(await screen.findByText('This field is required')).toBeTruthy();
    expect(screen).toHavePathname('/profile-edit/experience/new');
  });

  it('job preferences: chips and lists are saved together', async () => {
    await openApp('/profile-edit/preferences');
    await screen.findByTestId('preferences-form');
    await type('field-titles', 'QA tester, Developer');
    await press('pref-regions-somaliland');
    await press('pref-regions-remote');
    await press('pref-workModes-hybrid');
    await press('preferences-save');
    expect(calls.find((c) => c.route === 'PUT /profile/preferences')?.body).toMatchObject({
      titles: ['QA tester', 'Developer'],
      regions: ['somaliland', 'remote'],
      workModes: ['hybrid'],
      cities: [],
    });
  });

  it('End Test: edits are saved and still there after an app restart', async () => {
    await openApp('/profile-edit/languages/new');
    await screen.findByTestId('languages-form');
    await type('field-language', 'Somali');
    await press('field-level-native');
    await press('languages-form-save');
    expect(calls.some((c) => c.route === 'POST /profile/languages')).toBe(true);

    // "Close the app", then open it again: the profile comes back from the server.
    await cleanup();
    calls.length = 0;
    await openApp('/profile-edit/languages');
    expect(await screen.findByText('Somali')).toBeTruthy();
    expect(screen.getByText('Native')).toBeTruthy();
    expect(calls.some((c) => c.route === 'GET /profile')).toBe(true);
  });

  it('a profile that cannot be loaded shows an error with Try again', async () => {
    offline = false;
    const realFetch = globalThis.fetch;
    let failProfile = true;
    globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (failProfile && String(url).endsWith('/profile')) {
        throw new TypeError('Network request failed');
      }
      return realFetch(url, init);
    }) as unknown as typeof fetch;

    await openApp();
    expect(await screen.findByTestId('profile-error')).toBeTruthy();
    failProfile = false;
    await press('profile-retry');
    expect(await screen.findByTestId('profile-completion')).toBeTruthy();
  });

  it('Home shows the real profile completion and opens Profile', async () => {
    store.personal = { fullName: 'Amina Test', headline: 'QA tester', city: 'Hargeisa' };
    store.languages = [{ id: 'l1', language: 'Somali', level: 'native' }];
    await openApp('/home');
    expect(await screen.findByTestId('home-profile')).toBeTruthy();
    expect(screen.getAllByText('Profile 40% complete').length).toBeGreaterThan(0);
    await press('home-profile-action');
    expect(await screen.findByTestId('profile-screen')).toBeTruthy();
  });
});
