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

// The phone's file picker and file reading.
const mockPicked = { value: null as null | { name: string; uri: string; size: number } };
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () =>
    mockPicked.value
      ? { canceled: false, assets: [{ ...mockPicked.value, mimeType: 'application/pdf' }] }
      : { canceled: true, assets: null },
  ),
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ size: 0, base64: async () => 'JVBERi0xLjQK' })),
}));

const EMAIL = 'amina@example.com';
const JOB_TEXT =
  'Data Officer at Example Health Partnership (synthetic). Hargeisa. Requirements: Excel, SQL. Desirable: DHIS2. Apply by 2026-12-15.';

type Reply = { status: number; body: unknown };
const ok = (data: unknown, status = 200): Reply => ({ status, body: { data, error: null } });
const fail = (status: number, code: string, message: string): Reply => ({
  status,
  body: { data: null, error: { code, message } },
});

const job = (id: string, title: string | null = 'Data Officer') => ({
  id,
  source: 'text',
  fileName: null,
  createdAt: '2026-11-19T10:00:00.000Z',
  extracted: {
    language: 'en',
    title,
    company: 'Example Health Partnership',
    location: 'Hargeisa',
    jobType: null,
    requiredSkills: ['Excel', 'SQL'],
    preferredSkills: ['DHIS2'],
    education: [],
    experience: ['2 years in data entry'],
    responsibilities: [],
    qualifications: [],
    deadline: '2026-12-15',
    keywords: [],
  },
});

let jobs: ReturnType<typeof job>[];
let cvs: Record<string, unknown>[];
let jdReply: Reply | null;
const calls: { route: string; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  mockSecureStore.clear();
  mockSecureStore.set('kobaniq.refreshToken', 'saved-1');
  mockPicked.value = null;
  jobs = [];
  cvs = [];
  jdReply = null;
  calls.length = 0;
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname.replace('/api/v1', '');
    const body = init.body ? JSON.parse(init.body as string) : {};
    calls.push({ route: `${method} ${path}`, body });
    let reply: Reply;
    if (path === '/auth/refresh') reply = ok(session(EMAIL));
    else if (path === '/me') reply = ok({ user: user(EMAIL) });
    else if (method === 'GET' && path === '/cvs') reply = ok({ cvs });
    else if (method === 'GET' && path === '/job-descriptions')
      reply = ok({ jobDescriptions: jobs });
    else if (method === 'POST' && path === '/job-descriptions') {
      reply = jdReply ?? ok({ jobDescription: job('jd1') }, 201);
    } else if (method === 'GET' && path.startsWith('/job-descriptions/')) {
      const found = jobs.find((j) => path.endsWith(j.id));
      reply = found
        ? ok({ jobDescription: found })
        : fail(404, 'NOT_FOUND', 'Job description not found');
    } else throw new TypeError('Network request failed');
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
const type = (testID: string, text: string) =>
  act(async () => {
    fireEvent.changeText(screen.getByTestId(testID), text);
  });

describe('TIQ-8: job ad screens', () => {
  it('CV tab: empty state, then New CV opens "Add the job ad"', async () => {
    await openApp('/cv');
    expect(await screen.findByTestId('cv-empty')).toBeTruthy();
    expect(screen.getByText('No CVs yet')).toBeTruthy();
    await press('cv-new');
    expect(screen).toHavePathname('/cv-job');
    expect(screen.getByText('Only the job ad is sent to the AI, never your profile.')).toBeTruthy();
  });

  it('paste: too short is refused here; a real ad is read and its details shown', async () => {
    await openApp('/cv-job');
    await type('cv-job-text', 'Too short.');
    await press('cv-job-submit');
    expect(screen.getByText('Paste the whole job ad (at least 50 characters).')).toBeTruthy();
    expect(calls.some((c) => c.route === 'POST /job-descriptions')).toBe(false);

    await type('cv-job-text', `  ${JOB_TEXT}  `);
    await press('cv-job-submit');
    expect(calls.find((c) => c.route === 'POST /job-descriptions')?.body).toEqual({
      text: JOB_TEXT,
    });
    expect(screen).toHavePathname('/cv-job/jd1');
    expect(await screen.findByTestId('job-details')).toBeTruthy();
    expect(screen.getByText('Data Officer')).toBeTruthy();
    // Required and preferred skills are shown apart.
    expect(screen.getByTestId('job-required')).toHaveTextContent(/Excel.*SQL/);
    expect(screen.getByTestId('job-preferred')).toHaveTextContent(/DHIS2/);
    expect(screen.getByTestId('job-preferred')).not.toHaveTextContent(/SQL/);
    expect(screen.getByTestId('job-deadline')).toHaveTextContent(/Apply by/);
  });

  it("shows the server's explanation when the text is not a job ad", async () => {
    jdReply = fail(
      422,
      'NOT_A_JOB_DESCRIPTION',
      'This does not look like a job description. Paste or upload a job advertisement',
    );
    await openApp('/cv-job');
    await type(
      'cv-job-text',
      'A recipe for tea: boil water, add leaves and milk, then sugar to taste. Enjoy.',
    );
    await press('cv-job-submit');
    expect(
      await screen.findByText(
        'This does not look like a job description. Paste or upload a job advertisement',
      ),
    ).toBeTruthy();
    expect(screen).toHavePathname('/cv-job');
  });

  it('PDF: too large is refused before sending; a PDF is sent with its name', async () => {
    await openApp('/cv-job');
    await press('cv-job-mode-pdf');
    await press('cv-job-submit');
    expect(screen.getByText('Choose a PDF first.')).toBeTruthy();

    mockPicked.value = { name: 'big.pdf', uri: 'file:///cache/big.pdf', size: 6 * 1024 * 1024 };
    await press('cv-job-pick');
    expect(
      screen.getByText('This PDF is larger than 5 MB. Choose a smaller file or paste the text.'),
    ).toBeTruthy();

    mockPicked.value = { name: 'data-officer.pdf', uri: 'file:///cache/ad.pdf', size: 40_000 };
    await press('cv-job-pick');
    expect(screen.getByTestId('cv-job-file')).toHaveTextContent('data-officer.pdf · 39 KB');
    await press('cv-job-submit');
    expect(calls.find((c) => c.route === 'POST /job-descriptions')?.body).toEqual({
      pdf: { data: 'JVBERi0xLjQK', fileName: 'data-officer.pdf' },
    });
    expect(screen).toHavePathname('/cv-job/jd1');
  });

  it('CV tab lists CVs by job title and the saved job ads', async () => {
    jobs = [job('jd7', 'Public Health Officer')];
    cvs = [
      {
        id: 'cv1',
        jobDescriptionId: 'jd7',
        language: 'so',
        version: 2,
        status: 'draft',
        template: 'classic',
        missingInfo: [],
        createdAt: '2026-11-19T11:00:00.000Z',
      },
    ];
    await openApp('/cv');
    const row = await screen.findByTestId('cv-row-cv1');
    expect(row).toHaveTextContent(/Public Health Officer/);
    expect(row).toHaveTextContent(/Soomaali · version 2/);
    await press('cv-job-row-jd7');
    expect(screen).toHavePathname('/cv-job/jd7');
    expect(await screen.findByTestId('job-details')).toBeTruthy();
  });
});
