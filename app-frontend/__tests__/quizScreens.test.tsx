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

const EMAIL = 'amina@example.com';
type Reply = { status: number; body: unknown };
const ok = (data: unknown, status = 200): Reply => ({ status, body: { data, error: null } });
const fail = (status: number, code: string, message: string): Reply => ({
  status,
  body: { data: null, error: { code, message } },
});

/**
 * A tiny quiz server. Option 1 is always right. The difficulty of each question
 * follows a script (like the backend's adaptive engine would); topics T1–T3.
 */
const DIFFICULTIES = [
  'normal',
  'normal',
  'normal',
  'hard',
  'normal',
  'hard',
  'hard',
  'hard',
  'hard',
  'hard',
];
const TOPIC = (n: number) => `T${(n % 3) + 1}`;
type Stored = {
  id: string;
  skillId: string;
  skillName: string;
  language: string;
  length: number;
  startDifficulty: string;
  status: string;
  difficulty: string;
  answered: number;
  wrongTopics: string[];
  createdAt: string;
  finishedAt: string | null;
};
let quizzes: Stored[];
let skillsCalls: number;
let nextId: number;
const calls: { route: string; body: Record<string, unknown> }[] = [];

const question = (q: Stored) =>
  q.status === 'in_progress'
    ? {
        id: `q${q.answered + 1}`,
        number: q.answered + 1,
        total: q.length,
        difficulty: DIFFICULTIES[q.answered],
        topic: TOPIC(q.answered),
        question: `Question ${q.answered + 1} about Excel?`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'],
      }
    : null;
const result = (q: Stored) =>
  q.status === 'finished'
    ? {
        correct: q.length - q.wrongTopics.length,
        total: q.length,
        scorePercent: Math.round(((q.length - q.wrongTopics.length) / q.length) * 100),
        level: 'advanced',
        highestDifficulty: 'hard',
        strengths: ['T1', 'T2', 'T3'].filter((t) => !q.wrongTopics.includes(t)),
        gaps: [...new Set(q.wrongTopics)],
      }
    : null;
const view = (q: Stored) => ({ ...q, question: question(q), result: result(q) });

function quizRoute(method: string, path: string, body: Record<string, unknown>): Reply {
  if (method === 'GET' && path === '/assessments') {
    return ok({ assessments: quizzes.map((q) => ({ ...view(q), question: undefined })) });
  }
  if (method === 'POST' && path === '/assessments') {
    const q: Stored = {
      id: `a${nextId++}`,
      skillId: body.skillId as string,
      skillName: 'Microsoft Excel',
      language: body.language as string,
      length: (body.length as number) ?? 5,
      startDifficulty: body.difficulty as string,
      status: 'in_progress',
      difficulty: body.difficulty as string,
      answered: 0,
      wrongTopics: [],
      createdAt: '2026-11-20T08:00:00.000Z',
      finishedAt: null,
    };
    quizzes = [q, ...quizzes];
    return ok({ assessment: view(q) }, 201);
  }
  const found = quizzes.find((q) => path.startsWith(`/assessments/${q.id}`));
  if (!found) return fail(404, 'ASSESSMENT_NOT_FOUND', 'Quiz not found');
  if (method === 'GET') return ok({ assessment: view(found) });
  if (path.endsWith('/cancel')) {
    found.status = 'cancelled';
    return ok({ assessment: view(found) });
  }
  // POST /answers
  const current = question(found)!;
  const correct = body.choice === 1;
  if (!correct) found.wrongTopics.push(current.topic);
  found.answered += 1;
  if (found.answered >= found.length) {
    found.status = 'finished';
    found.finishedAt = '2026-11-20T08:10:00.000Z';
  }
  return ok({
    feedback: {
      questionId: current.id,
      correct,
      correctChoice: 1,
      explanation: `Explanation ${current.id}.`,
    },
    assessment: view(found),
  });
}

beforeEach(() => {
  mockSecureStore.clear();
  mockSecureStore.set('kobaniq.refreshToken', 'saved-1');
  quizzes = [];
  skillsCalls = 0;
  nextId = 1;
  calls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname.replace('/api/v1', '');
    const body = init.body ? JSON.parse(init.body as string) : {};
    calls.push({ route: `${method} ${path}`, body });
    let reply: Reply;
    if (path === '/auth/refresh') reply = ok(session(EMAIL));
    else if (path === '/me') reply = ok({ user: user(EMAIL) });
    else if (path === '/skills') {
      skillsCalls += 1;
      reply = ok({
        skills: [
          {
            id: 's1',
            name: 'Microsoft Excel',
            category: null,
            selfLevel: 'mid',
            assessedLevel: null,
            yearsExp: null,
            lastAssessedAt: null,
            gaps: [],
            updatedAt: '2026-11-20T00:00:00.000Z',
          },
        ],
        counts: { total: 1, assessed: 0, selfReported: 1 },
      });
    } else if (path.startsWith('/assessments')) reply = quizRoute(method, path, body);
    else throw new TypeError('Network request failed');
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
  }) as unknown as typeof fetch;
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
});

const openApp = (url: string) =>
  act(async () => {
    renderRouter('./src/app', { initialUrl: url });
  });
const press = (testID: string) =>
  act(async () => {
    fireEvent.press(screen.getByTestId(testID));
  });

async function answer(choice: number) {
  await press(`quiz-option-${choice}`);
  await press('quiz-check');
  expect(screen.getByTestId('quiz-feedback')).toBeTruthy();
  await press('quiz-next');
}

describe('TIQ-14: quiz screens', () => {
  it('start: choose skill, difficulty, language and length; only then Start works', async () => {
    await openApp('/quiz');
    expect(await screen.findByTestId('quiz-skill-s1')).toBeTruthy();
    expect(
      screen.getByText('Quiz results measure knowledge, not proof of real-world experience.'),
    ).toBeTruthy();
    expect(screen.getByTestId('quiz-start').props.accessibilityState).toMatchObject({
      disabled: true,
    });

    await press('quiz-skill-s1');
    await press('quiz-difficulty-hard');
    await press('quiz-language-so');
    await press('quiz-length-10');
    await press('quiz-start');
    expect(calls.find((c) => c.route === 'POST /assessments')?.body).toEqual({
      skillId: 's1',
      difficulty: 'hard',
      language: 'so',
      length: 10,
    });
    expect(screen).toHavePathname('/quiz/a1');
    expect(await screen.findByTestId('quiz-question')).toHaveTextContent('Question 1 about Excel?');
    expect(screen.getByTestId('quiz-progress')).toHaveTextContent('1 / 10');
  });

  it('End Test: a 10-question quiz end to end, with feedback, adapting, and the report', async () => {
    await openApp('/quiz?skillId=s1');
    await screen.findByTestId('quiz-skill-s1');
    await press('quiz-length-10');
    await press('quiz-start');
    await screen.findByTestId('quiz-question');
    expect(screen.getByTestId('quiz-difficulty')).toHaveTextContent('Normal');

    // Check stays off until an option is chosen.
    expect(screen.getByTestId('quiz-check').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await press('quiz-option-0');
    await press('quiz-check');
    expect(screen.getByText('Not quite')).toBeTruthy();
    expect(screen.getByText('Explanation q1.')).toBeTruthy();
    expect(screen.getByTestId('quiz-option-1').props.accessibilityLabel).toMatch(/right answer/);
    await press('quiz-next');

    await answer(1); // q2
    await answer(1); // q3 → server raises the difficulty for q4
    expect(screen.getByTestId('quiz-difficulty')).toHaveTextContent('Hard');
    expect(screen.getByTestId('quiz-adapted')).toHaveTextContent('Difficulty adapted');
    for (let n = 4; n <= 9; n += 1) await answer(n === 5 ? 2 : 1);
    expect(screen.getByTestId('quiz-progress')).toHaveTextContent('10 / 10');
    await press('quiz-option-1');
    await press('quiz-check');
    expect(screen.getByTestId('quiz-next')).toHaveTextContent('See results');
    await press('quiz-next');

    expect(screen.getByTestId('quiz-report')).toBeTruthy();
    expect(screen.getByTestId('quiz-score')).toHaveTextContent('80 %');
    expect(screen.getByText('8 of 10 correct')).toBeTruthy();
    expect(screen.getByTestId('quiz-level')).toHaveTextContent('Assessed level: Advanced');
    expect(screen.getByTestId('quiz-strengths')).toHaveTextContent(/T3/);
    expect(screen.getByTestId('quiz-gaps')).toHaveTextContent(/T1/);
    expect(screen.getByTestId('quiz-recommendations')).toHaveTextContent(
      /Practise T1, then take the quiz again\./,
    );
    expect(
      screen.getByText('Quiz results measure knowledge, not proof of real-world experience.'),
    ).toBeTruthy();
    expect(skillsCalls).toBeGreaterThan(1); // the skill profile reloads the new assessed level

    await press('quiz-to-skills');
    expect(screen).toHavePathname('/skills');
  });

  it('leaving mid-quiz: continue later keeps the answers; cancel ends it safely', async () => {
    await openApp('/quiz?skillId=s1');
    await screen.findByTestId('quiz-skill-s1');
    await press('quiz-start');
    await screen.findByTestId('quiz-question');
    await answer(1);
    await answer(1);

    await press('back');
    expect(screen.getByTestId('quiz-leave')).toBeTruthy();
    await press('quiz-leave-stay');
    expect(screen.queryByTestId('quiz-leave')).toBeNull();
    await press('back');
    await press('quiz-leave-later');
    expect(screen).toHavePathname('/quiz');
    expect(await screen.findByTestId('quiz-unfinished-a1')).toHaveTextContent(
      /Unfinished Microsoft Excel quiz: 2 of 5 answered\./,
    );

    await press('quiz-continue-a1');
    expect(screen).toHavePathname('/quiz/a1');
    expect(await screen.findByTestId('quiz-progress')).toHaveTextContent('3 / 5');

    await press('back');
    await press('quiz-leave-cancel');
    expect(calls.some((c) => c.route === 'POST /assessments/a1/cancel')).toBe(true);
    expect(quizzes[0].status).toBe('cancelled');
  });

  it('the AI could not write a quiz: the server explains, nothing starts', async () => {
    globalThis.fetch = ((original) =>
      jest.fn(async (url: string, init: RequestInit = {}) => {
        if ((init.method ?? 'GET') === 'POST' && url.endsWith('/assessments')) {
          const reply = fail(
            429,
            'AI_QUOTA_REACHED',
            'The free AI limit has been reached for now. Please try again later',
          );
          return { ok: false, status: 429, json: async () => reply.body };
        }
        return original(url, init);
      }))(
      globalThis.fetch as unknown as (url: string, init?: RequestInit) => Promise<Response>,
    ) as unknown as typeof fetch;
    await openApp('/quiz?skillId=s1');
    await screen.findByTestId('quiz-skill-s1');
    await press('quiz-start');
    expect(
      await screen.findByText('The free AI limit has been reached for now. Please try again later'),
    ).toBeTruthy();
    expect(screen).toHavePathname('/quiz');
  });

  it('entry points: Home "Assess skill" and the skill screen open the quiz', async () => {
    await openApp('/home');
    await press('home-quick-assess');
    expect(screen).toHavePathname('/quiz');

    await openApp('/skills-edit/s1');
    await press('skill-quiz');
    expect(screen).toHavePathname('/quiz');
    expect(await screen.findByTestId('quiz-skill-s1')).toBeTruthy();
    expect(screen.getByTestId('quiz-skill-s1').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });
});
