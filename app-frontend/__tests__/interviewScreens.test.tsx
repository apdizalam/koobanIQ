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
type Reply = { status: number; body?: unknown };
const ok = (data: unknown, status = 200): Reply => ({ status, body: { data, error: null } });

/** A saved job ad (synthetic). */
const AD = {
  id: 'jd1',
  source: 'text',
  fileName: null,
  createdAt: '2026-11-20T07:00:00.000Z',
  extracted: {
    language: 'en',
    title: 'Monitoring Assistant',
    company: 'Example Relief Partnership',
    location: null,
    jobType: null,
    requiredSkills: [],
    preferredSkills: [],
    education: [],
    experience: [],
    responsibilities: [],
    qualifications: [],
    deadline: null,
    keywords: [],
  },
};

type Stored = {
  id: string;
  type: string;
  role: string;
  length: number;
  status: string;
  answers: { questionId: string; answer: string; score: number }[];
};
let sessions: Stored[];
const calls: { route: string; body: unknown }[] = [];

const fb = (score: number) => ({
  score,
  summary: `Summary for ${score}.`,
  strengths: ['Clear'],
  improvements: ['Add an example'],
  betterAnswer: 'Start with [your example].',
});
function view(s: Stored) {
  const next = s.status === 'in_progress' ? s.answers.length : -1;
  const avg = s.answers.length
    ? s.answers.reduce((sum, a) => sum + a.score, 0) / s.answers.length
    : 0;
  return {
    id: s.id,
    type: s.type,
    role: s.role,
    employer: null,
    jobDescriptionId: null,
    jobId: null,
    language: 'en',
    length: s.length,
    status: s.status,
    answered: s.answers.length,
    question:
      next >= 0 && next < s.length
        ? {
            id: `q${next + 1}`,
            number: next + 1,
            total: s.length,
            question: `Question ${next + 1}?`,
            focus: 'Teamwork',
          }
        : null,
    summary:
      s.status === 'finished'
        ? { averageScore: avg, answered: s.answers.length, best: 'q1', weakest: 'q1' }
        : null,
    transcript: s.answers.map((a, i) => ({
      questionId: a.questionId,
      number: i + 1,
      question: `Question ${i + 1}?`,
      focus: 'Teamwork',
      answer: a.answer,
      feedback: fb(a.score),
      answeredAt: '2026-11-20T09:00:00.000Z',
    })),
    createdAt: '2026-11-20T08:00:00.000Z',
    finishedAt: s.status === 'finished' ? '2026-11-20T09:10:00.000Z' : null,
  };
}

function api(method: string, path: string, body: Record<string, unknown>): Reply | null {
  if (path === '/auth/refresh') return ok(session(EMAIL));
  if (path === '/me') return ok({ user: user(EMAIL) });
  if (path === '/cvs') return ok({ cvs: [] });
  if (path === '/job-descriptions') return ok({ jobDescriptions: [AD] });
  if (path === '/skills')
    return ok({ skills: [], counts: { total: 0, assessed: 0, selfReported: 0 } });
  if (method === 'GET' && path === '/interviews') {
    return ok({ interviews: sessions.map((s) => ({ ...view(s), transcript: undefined })) });
  }
  if (method === 'POST' && path === '/interviews') {
    const s: Stored = {
      id: `i${sessions.length + 1}`,
      type: body.type as string,
      role: (body.role as string) ?? AD.extracted.title,
      length: body.length as number,
      status: 'in_progress',
      answers: [],
    };
    sessions.push(s);
    return ok({ interview: view(s) }, 201);
  }
  const found = sessions.find((s) => path.startsWith(`/interviews/${s.id}`));
  if (!found) return null;
  if (method === 'GET') return ok({ interview: view(found) });
  if (method === 'DELETE') {
    sessions = sessions.filter((s) => s !== found);
    return { status: 204 };
  }
  if (path.endsWith('/cancel')) {
    found.status = 'cancelled';
    return ok({ interview: view(found) });
  }
  // POST /answers: score = 4 + number of the answer.
  const score = 4 + found.answers.length;
  found.answers.push({
    questionId: body.questionId as string,
    answer: body.answer as string,
    score,
  });
  if (found.answers.length >= found.length) found.status = 'finished';
  return ok({ feedback: { questionId: body.questionId, ...fb(score) }, interview: view(found) });
}

beforeEach(() => {
  mockSecureStore.clear();
  mockSecureStore.set('kobaniq.refreshToken', 'saved-1');
  sessions = [];
  calls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname.replace('/api/v1', '');
    const body = init.body ? JSON.parse(init.body as string) : {};
    calls.push({ route: `${method} ${path}`, body });
    const reply = api(method, path, body);
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

async function openApp(url: string, ready: string) {
  await act(async () => {
    renderRouter('./src/app', { initialUrl: url });
  });
  expect(screen.getByTestId(ready)).toBeTruthy();
}
const type = (testID: string, text: string) =>
  act(async () => {
    fireEvent.changeText(screen.getByTestId(testID), text);
  });
const press = (testID: string) =>
  act(async () => {
    fireEvent.press(screen.getByTestId(testID));
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });

describe('TIQ-19: interview practice', () => {
  it('End Test: a 5-question text session completes with feedback per answer; transcript and history', async () => {
    await openApp('/interview', 'interview-privacy');
    // The warning about personal details is shown before anything is typed.
    expect(screen.getByText(/Do not write your name, phone number/)).toBeTruthy();
    expect(screen.getByTestId('interview-start').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await press('interview-type-behavioral');
    await type('interview-role', 'Data officer');
    await press('interview-start');
    expect(calls.find((c) => c.route === 'POST /interviews')!.body).toEqual({
      type: 'behavioral',
      role: 'Data officer',
      language: 'en',
      length: 5,
    });

    for (let n = 1; n <= 5; n += 1) {
      expect(screen.getByTestId('interview-question').props.children).toBe(`Question ${n}?`);
      expect(screen.getByTestId('interview-send').props.accessibilityState).toMatchObject({
        disabled: true,
      });
      await type('interview-answer', `Answer number ${n}`);
      await press('interview-send');
      expect(screen.getByTestId('interview-feedback-score').props.children).toBe(`${3 + n}/10`);
      expect(screen.getByText(`Summary for ${3 + n}.`)).toBeTruthy();
      await press('interview-next');
    }
    // Summary + whole transcript.
    expect(screen.getByTestId('interview-summary')).toBeTruthy();
    expect(screen.getByText('Average 6/10')).toBeTruthy();
    expect(screen.getByText('Answer number 3')).toBeTruthy();
    expect(screen.getByTestId('interview-entry-q5')).toBeTruthy();
    const answers = calls.filter((c) => c.route === 'POST /interviews/i1/answers');
    expect(answers.map((c) => (c.body as { answer: string }).answer)).toEqual([
      'Answer number 1',
      'Answer number 2',
      'Answer number 3',
      'Answer number 4',
      'Answer number 5',
    ]);

    // History on the start screen.
    await openApp('/interview', 'interview-privacy');
    expect(screen.getByTestId('interview-past-i1')).toBeTruthy();
    expect(screen.getByText(/Average 6\/10/)).toBeTruthy();
  });

  it('job-specific: choose a saved job ad; stop keeps the answers; continue later', async () => {
    await openApp('/interview', 'interview-privacy');
    await press('interview-type-job_specific');
    expect(screen.queryByTestId('interview-role')).toBeNull();
    await press('interview-ad-jd1');
    await press('interview-length-3');
    await press('interview-start');
    expect(calls.find((c) => c.route === 'POST /interviews')!.body).toEqual({
      type: 'job_specific',
      jobDescriptionId: 'jd1',
      language: 'en',
      length: 3,
    });
    await type('interview-answer', 'First answer');
    await press('interview-send');
    await press('interview-next');
    // Back on the start screen, the unfinished session can be continued.
    await openApp('/interview', 'interview-privacy');
    expect(screen.getByTestId('interview-continue-i1')).toBeTruthy();
    expect(screen.getByText('1 of 3 answered')).toBeTruthy();
    await press('interview-continue-i1');
    expect(screen.getByTestId('interview-question').props.children).toBe('Question 2?');
    await press('interview-stop');
    expect(calls.some((c) => c.route === 'POST /interviews/i1/cancel')).toBe(true);
  });

  it('from a found job: the job is preselected; Somali texts', async () => {
    await openApp('/interview?jobId=job7&jobTitle=Water%20Engineer', 'interview-privacy');
    expect(screen.getByTestId('interview-from-job').props.children).toBe('Water Engineer');
    await press('interview-start');
    expect(calls.find((c) => c.route === 'POST /interviews')!.body).toMatchObject({
      type: 'job_specific',
      jobId: 'job7',
    });
    await act(async () => {
      await i18n.changeLanguage('so');
    });
    expect(screen.getByText('Jawaabtaada')).toBeTruthy();
  });
});
