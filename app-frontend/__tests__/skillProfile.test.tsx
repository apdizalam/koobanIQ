/* eslint-disable import/no-unresolved, import/namespace, import/no-duplicates --
   expo-router/testing-library is published through the package "exports" map, which the
   lint import resolver cannot follow; TypeScript and Jest resolve it fine. */
import { act, fireEvent, within } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { StyleSheet } from 'react-native';
import i18n from '../src/i18n';
import { colors } from '../src/theme';
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
type StoredSkill = {
  id: string;
  name: string;
  category: string | null;
  selfLevel: string;
  assessedLevel: string | null;
  yearsExp: number | null;
  lastAssessedAt: string | null;
  gaps: string[];
};

/** In-memory skills server with the backend's answers (counts from the stored data). */
let store: StoredSkill[];
let nextId = 1;
const calls: { route: string; body: unknown }[] = [];

const skill = (over: Partial<StoredSkill>): StoredSkill => ({
  id: `s${nextId++}`,
  name: 'Skill',
  category: null,
  selfLevel: 'mid',
  assessedLevel: null,
  yearsExp: null,
  lastAssessedAt: null,
  gaps: [],
  ...over,
});

const reply = (status: number, body?: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;
const ok = (data: unknown, status = 200) => reply(status, { data, error: null });

function skillsRoute(method: string, path: string, body: Record<string, unknown>) {
  const id = path.split('/')[2];
  if (method === 'GET') {
    const sorted = [...store].sort((a, b) => a.name.localeCompare(b.name));
    return ok({
      skills: sorted,
      counts: {
        total: store.length,
        assessed: store.filter((s) => s.assessedLevel).length,
        selfReported: store.filter((s) => !s.assessedLevel).length,
      },
    });
  }
  if (method === 'POST') {
    const name = String(body.name).trim();
    if (store.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      return reply(409, {
        data: null,
        error: { code: 'SKILL_EXISTS', message: 'You already have this skill. Edit it instead' },
        meta: {},
      });
    }
    const added = skill({ ...(body as Partial<StoredSkill>), name });
    store.push(added);
    return ok({ skill: added }, 201);
  }
  const index = store.findIndex((s) => s.id === id);
  if (method === 'PATCH') {
    store[index] = { ...store[index], ...(body as Partial<StoredSkill>) };
    return ok({ skill: store[index] });
  }
  store.splice(index, 1);
  return reply(204);
}

beforeEach(() => {
  mockSecureStore.clear();
  mockSecureStore.set('kobaniq.refreshToken', 'saved-1');
  nextId = 1;
  store = [
    skill({ name: 'TypeScript', category: 'Frontend', assessedLevel: 'advanced' }),
    skill({
      name: 'Node.js',
      category: 'Backend',
      selfLevel: 'expert',
      assessedLevel: 'beginner',
      lastAssessedAt: '2026-11-10T00:00:00.000Z',
      gaps: ['Streams', 'Testing'],
    }),
    skill({ name: 'GraphQL', category: 'Backend', selfLevel: 'mid' }),
    skill({ name: 'Excel', selfLevel: 'advanced' }),
  ];
  calls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname.replace('/api/v1', '');
    const body = init.body ? JSON.parse(init.body as string) : {};
    calls.push({ route: `${method} ${path}`, body });
    if (path === '/auth/refresh') return ok(session(EMAIL));
    if (path === '/me') return ok({ user: user(EMAIL) });
    if (path.startsWith('/skills')) return skillsRoute(method, path, body);
    throw new TypeError('Network request failed');
  }) as unknown as typeof fetch;
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

async function openApp(url = '/skills') {
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

describe('TIQ-15 End Test: skill profile', () => {
  it('assessed chips are solid navy with a check; self-reported chips are dashed', async () => {
    await openApp();
    await screen.findByTestId('skills-count-assessed');

    const assessed = StyleSheet.flatten(screen.getByTestId('skill-s1').props.style);
    const selfReported = StyleSheet.flatten(screen.getByTestId('skill-s3').props.style);
    expect(assessed.backgroundColor).toBe(colors.light.primary);
    expect(assessed.borderStyle).not.toBe('dashed');
    expect(selfReported.borderStyle).toBe('dashed');
    expect(selfReported.backgroundColor).not.toBe(colors.light.primary);
    // Assessed chips show the assessed level; spoken labels say which kind it is.
    expect(screen.getByText('TypeScript · Advanced')).toBeTruthy();
    expect(screen.getByTestId('skill-s1').props.accessibilityLabel).toBe(
      'TypeScript · Advanced, Assessed',
    );
    expect(screen.getByTestId('skill-s3').props.accessibilityLabel).toBe('GraphQL, Self-reported');
  });

  it('counts (assessed / self-reported / gaps) match the stored data', async () => {
    await openApp();
    expect(await screen.findByTestId('skills-count-assessed')).toHaveTextContent('2Assessed');
    expect(screen.getByTestId('skills-count-selfReported')).toHaveTextContent('2Self-reported');
    expect(screen.getByTestId('skills-count-gaps')).toHaveTextContent('2Gaps found');
    expect(calls.some((c) => c.route === 'GET /skills')).toBe(true);
  });

  it('no negative label from a single score; the quiz is offered gently and is optional', async () => {
    await openApp();
    await screen.findByTestId('skills-count-assessed');
    // Node.js was rated "expert" by the user but assessed "beginner": shown neutrally.
    expect(screen.getByText('Node.js · Beginner')).toBeTruthy();
    expect(screen.queryByText(/fail|weak|reject|poor|bad|wrong/i)).toBeNull();

    expect(screen.getByText('Verify Excel?')).toBeTruthy();
    await press('skills-maybe-later');
    expect(screen.getByText('Verify GraphQL?')).toBeTruthy();
    await press('skills-maybe-later');
    expect(screen.queryByTestId('skills-suggestion')).toBeNull();
  });

  it('skills are grouped; ungrouped ones go last; the filter hides a kind', async () => {
    await openApp();
    await screen.findByTestId('skills-count-assessed');
    const backend = screen.getByTestId('skills-group-Backend');
    expect(within(backend).getByText('GraphQL')).toBeTruthy();
    expect(within(screen.getByTestId('skills-group-Other skills')).getByText('Excel')).toBeTruthy();

    await press('skills-filter-selfReported');
    expect(screen.queryByText('GraphQL')).toBeNull();
    expect(screen.getByText('TypeScript · Advanced')).toBeTruthy();
  });

  it('add a skill: + opens the form, the list and counts reload from the server', async () => {
    await openApp();
    await screen.findByTestId('skills-count-assessed');
    await press('skills-add');
    await type('field-name', 'Docker');
    await press('field-selfLevel-beginner');
    await type('field-category', 'DevOps');
    await press('skill-form-save');

    expect(calls.find((c) => c.route === 'POST /skills')?.body).toEqual({
      name: 'Docker',
      selfLevel: 'beginner',
      category: 'DevOps',
    });
    expect(await screen.findByTestId('skills-group-DevOps')).toBeTruthy();
    expect(screen.getByTestId('skills-count-selfReported')).toHaveTextContent('3Self-reported');
  });

  it('a duplicate skill shows the server message', async () => {
    await openApp('/skills-edit/new');
    await screen.findByTestId('skill-form');
    await type('field-name', 'typescript');
    await press('field-selfLevel-mid');
    await press('skill-form-save');
    expect(await screen.findByText('You already have this skill. Edit it instead')).toBeTruthy();
  });

  it('editing an assessed skill changes only the self level; the assessed level is read-only', async () => {
    await openApp();
    await screen.findByTestId('skills-count-assessed');
    await press('skill-s2');
    expect(screen.getByTestId('skill-assessed')).toHaveTextContent(/Assessed level: Beginner/);
    expect(screen.getByText('Worth learning next: Streams, Testing')).toBeTruthy();

    await press('field-selfLevel-advanced');
    await press('skill-form-save');
    const patch = calls.find((c) => c.route === 'PATCH /skills/s2')?.body as Record<
      string,
      unknown
    >;
    expect(patch.selfLevel).toBe('advanced');
    expect('assessedLevel' in patch).toBe(false);
    expect(await screen.findByText('Node.js · Beginner')).toBeTruthy();
  });

  it('delete asks once more, then the skill is gone', async () => {
    await openApp();
    await screen.findByTestId('skills-count-assessed');
    await press('skill-s4');
    await press('skill-form-delete');
    await press('skill-form-delete-yes');
    expect(calls.some((c) => c.route === 'DELETE /skills/s4')).toBe(true);
    await screen.findByTestId('skills-screen');
    expect(screen.queryByText('Excel')).toBeNull();
  });

  it('no skills yet: an empty state with Add', async () => {
    store = [];
    await openApp();
    expect(await screen.findByTestId('skills-empty')).toBeTruthy();
    expect(screen.getByTestId('skills-count-assessed')).toHaveTextContent('0Assessed');
  });

  it('Home shows the real assessed count and opens the skill profile', async () => {
    await openApp('/home');
    expect(await screen.findByText('2 assessed')).toBeTruthy();
    expect(
      screen.getByText('2 skills are self-reported. A short optional quiz can confirm them.'),
    ).toBeTruthy();
    await press('home-skills-action');
    expect(await screen.findByTestId('skills-screen')).toBeTruthy();
  });
});
