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
const mockWritten: { name: string; bytes: Uint8Array }[] = [];
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: jest.fn().mockImplementation((...parts: unknown[]) => {
    const name = String(parts[parts.length - 1]);
    return {
      uri: `file:///cache/${name}`,
      size: 0,
      base64: async () => 'JVBERi0xLjQK',
      create: jest.fn(),
      write: jest.fn((bytes: Uint8Array) => mockWritten.push({ name, bytes })),
    };
  }),
}));
const mockShared: { uri: string; options: unknown }[] = [];
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async (uri: string, options: unknown) => {
    mockShared.push({ uri, options });
  }),
}));

const EMAIL = 'amina@example.com';
const JOB_TEXT =
  'Data Officer at Example Health Partnership (synthetic). Hargeisa. Requirements: Excel, SQL. Desirable: DHIS2. Apply by 2026-12-15.';

type Reply = { status: number; body: unknown; pdf?: Uint8Array };
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

/** A CV as the server returns it: every fact from the (synthetic) profile. */
const fullCv = (id: string, language: 'en' | 'so', jobDescriptionId = 'jd7') => ({
  id,
  jobDescriptionId,
  language,
  version: 1,
  status: 'draft',
  template: 'classic',
  missingInfo: [{ type: 'requiredSkill', item: 'SQL' }, { type: 'phone' }],
  createdAt: '2026-11-19T12:00:00.000Z',
  content: {
    language,
    header: {
      fullName: 'Amina Testcase',
      headline: 'Data clerk',
      city: 'Hargeisa',
      region: 'somaliland',
      email: 'amina.cv@example.com',
      phone: null,
    },
    summary: 'Data clerk with 3 years of Excel.',
    skills: [{ name: 'Excel', level: 'mid', assessed: false }],
    experience: [
      {
        id: 'e1',
        title: 'Data clerk',
        employer: 'Example Clinic',
        city: 'Hargeisa',
        startDate: '2022-03',
        endDate: null,
        bullets: ['Entered survey forms.'],
      },
    ],
    education: [],
    projects: [],
    certifications: [],
    languages: [{ id: 'l1', language: 'Somali', level: 'native' }],
  },
});

let jobs: ReturnType<typeof job>[];
let cvs: Record<string, unknown>[];
let jdReply: Reply | null;
let generateReply: Reply | null;
let pdfReply: Reply | null;
let nextCv: number;
const calls: { route: string; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  mockSecureStore.clear();
  mockSecureStore.set('kobaniq.refreshToken', 'saved-1');
  mockPicked.value = null;
  jobs = [];
  cvs = [];
  jdReply = null;
  generateReply = null;
  pdfReply = null;
  mockWritten.length = 0;
  mockShared.length = 0;
  nextCv = 1;
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
    } else if (method === 'POST' && path === '/cvs/generate') {
      if (generateReply) reply = generateReply;
      else {
        const made = fullCv(
          `new${nextCv++}`,
          body.language as 'en' | 'so',
          body.jobDescriptionId as string,
        );
        cvs = [made, ...cvs];
        reply = ok({ cv: made }, 201);
      }
    } else if (method === 'POST' && path.endsWith('/approve')) {
      const found = cvs.find((c) => path === `/cvs/${c.id}/approve`);
      if (found && found.status === 'draft') found.status = 'approved';
      reply = found ? ok({ cv: found }) : fail(404, 'CV_NOT_FOUND', 'CV not found');
    } else if (method === 'GET' && path.endsWith('/pdf')) {
      const found = cvs.find((c) => path === `/cvs/${c.id}/pdf`);
      if (pdfReply) reply = pdfReply;
      else if (!found) reply = fail(404, 'CV_NOT_FOUND', 'CV not found');
      else if (found.status === 'draft') {
        reply = fail(409, 'CV_NOT_APPROVED', 'Approve the CV before downloading it as a PDF');
      } else {
        found.status = 'exported';
        reply = { status: 200, body: null, pdf: new TextEncoder().encode('%PDF-1.3 test') };
      }
    } else if (method === 'PATCH' && path.startsWith('/cvs/')) {
      const found = cvs.find((c) => path === `/cvs/${c.id}`) as ReturnType<typeof fullCv>;
      const edited = {
        ...found.content,
        header: { ...found.content.header, headline: body.headline as string },
        summary: body.summary as string,
        experience: found.content.experience.map((e) => ({
          ...e,
          bullets:
            (body.experience as { id: string; bullets: string[] }[] | undefined)?.find(
              (x) => x.id === e.id,
            )?.bullets ?? e.bullets,
        })),
      };
      if (found.status === 'draft') {
        found.content = edited;
        reply = ok({ cv: found });
      } else {
        const copy = {
          ...found,
          id: `${found.id}-v2`,
          version: found.version + 1,
          status: 'draft',
          content: edited,
        };
        cvs = [copy, ...cvs];
        reply = ok({ cv: copy });
      }
    } else if (method === 'GET' && path.startsWith('/cvs/')) {
      const found = cvs.find((c) => path.endsWith(String(c.id)));
      reply = found ? ok({ cv: found }) : fail(404, 'NOT_FOUND', 'CV not found');
    } else if (method === 'DELETE' && path.startsWith('/cvs/')) {
      cvs = cvs.filter((c) => !path.endsWith(String(c.id)));
      reply = { status: 204, body: null };
    } else throw new TypeError('Network request failed');
    return {
      ok: reply.status < 400,
      status: reply.status,
      json: async () => reply.body,
      arrayBuffer: async () => reply.pdf?.buffer,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-disposition' && reply.pdf
            ? 'attachment; filename="CV-Amina-Testcase-en-v1.pdf"'
            : null,
      },
    };
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

describe('TIQ-9: CV language, generation and the CV', () => {
  beforeEach(() => {
    jobs = [job('jd7', 'Data Officer')];
  });

  it('Create CV stays off until a CV language is chosen; Somali CV while the app is English', async () => {
    await openApp('/cv-job/jd7');
    expect(await screen.findByText('CV language')).toBeTruthy();
    expect(screen.getByTestId('cv-generate').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await press('cv-generate');
    expect(calls.some((c) => c.route === 'POST /cvs/generate')).toBe(false);

    await press('cv-language-so');
    await press('cv-generate');
    expect(calls.find((c) => c.route === 'POST /cvs/generate')?.body).toEqual({
      jobDescriptionId: 'jd7',
      language: 'so',
    });
    expect(screen).toHavePathname('/cv-view/new1');
    expect(await screen.findByTestId('cv-preview')).toBeTruthy();
    // CV headings follow the CV language (Somali), the app stays English.
    expect(screen.getByText('Khibrad shaqo')).toBeTruthy();
    expect(screen.getByText('Hargeisa · 2022-03 – hadda')).toBeTruthy();
    expect(screen.getByText('Your CV')).toBeTruthy();
    expect(screen.getByTestId('cv-contact')).toHaveTextContent(/amina\.cv@example\.com/);
  });

  it('missing info: listed with a way to add each item', async () => {
    cvs = [fullCv('cv5', 'en')];
    await openApp('/cv-view/cv5');
    expect(await screen.findByTestId('cv-missing')).toBeTruthy();
    expect(screen.getByText('Required skill: SQL')).toBeTruthy();
    expect(screen.getByText('Your phone number')).toBeTruthy();
    await press('cv-missing-requiredSkill-SQL');
    expect(screen).toHavePathname('/skills-edit/new');
  });

  it('no CV email yet: the server explains and the app links to Personal info', async () => {
    generateReply = fail(
      422,
      'CV_CONTACT_EMAIL_REQUIRED',
      'Add the email address to show on your CVs (Profile → Personal info) before creating a CV',
    );
    await openApp('/cv-job/jd7');
    await screen.findByText('CV language');
    await press('cv-language-en');
    await press('cv-generate');
    expect(
      await screen.findByText(
        'Add the email address to show on your CVs (Profile → Personal info) before creating a CV',
      ),
    ).toBeTruthy();
    await press('cv-add-email');
    expect(screen).toHavePathname('/profile-edit/personal');
  });

  it('AI privacy blocked: the honest server message, no CV', async () => {
    generateReply = fail(
      403,
      'AI_PERSONAL_DATA_BLOCKED',
      'Creating CVs with AI is not available yet. KOBANIQ uses a free AI service during development, which must not receive personal data',
    );
    await openApp('/cv-job/jd7');
    await screen.findByText('CV language');
    await press('cv-language-en');
    await press('cv-generate');
    expect(await screen.findByText(/Creating CVs with AI is not available yet/)).toBeTruthy();
    expect(screen.queryByTestId('cv-add-email')).toBeNull();
    expect(screen).toHavePathname('/cv-job/jd7');
  });

  it('generate in the other language makes a new version; delete asks first', async () => {
    cvs = [fullCv('cv5', 'en')];
    await openApp('/cv-view/cv5');
    await screen.findByTestId('cv-preview');
    expect(screen.getByTestId('cv-other-language')).toHaveTextContent('Generate in Soomaali');
    await press('cv-other-language');
    expect(calls.find((c) => c.route === 'POST /cvs/generate')?.body).toEqual({
      jobDescriptionId: 'jd7',
      language: 'so',
    });
    expect(screen).toHavePathname('/cv-view/new1');
    expect(await screen.findByText('Khibrad shaqo')).toBeTruthy();

    await press('cv-delete');
    expect(screen.getByText('Delete this CV? This cannot be undone.')).toBeTruthy();
    expect(calls.some((c) => c.route.startsWith('DELETE'))).toBe(false);
    await press('cv-delete-yes');
    expect(calls.some((c) => c.route === 'DELETE /cvs/new1')).toBe(true);
  });
});

describe('TIQ-10: approve, edit the wording, download the PDF', () => {
  beforeEach(() => {
    jobs = [job('jd7', 'Data Officer')];
  });

  it('draft → Approve → Download PDF opens the share sheet; status follows', async () => {
    cvs = [fullCv('cv5', 'en')];
    await openApp('/cv-view/cv5');
    expect(await screen.findByTestId('cv-status')).toHaveTextContent('Draft');
    expect(screen.queryByTestId('cv-download')).toBeNull();

    await press('cv-approve');
    expect(calls.some((c) => c.route === 'POST /cvs/cv5/approve')).toBe(true);
    expect(screen.getByTestId('cv-status')).toHaveTextContent('Approved');
    expect(screen.getByText('Approved. You can now download it as a PDF.')).toBeTruthy();

    await press('cv-download');
    expect(calls.some((c) => c.route === 'GET /cvs/cv5/pdf')).toBe(true);
    expect(mockWritten[0].name).toBe('CV-Amina-Testcase-en-v1.pdf');
    expect(new TextDecoder().decode(mockWritten[0].bytes)).toBe('%PDF-1.3 test');
    expect(mockShared[0]).toEqual({
      uri: 'file:///cache/CV-Amina-Testcase-en-v1.pdf',
      options: expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }),
    });
    expect(screen.getByTestId('cv-status')).toHaveTextContent('Downloaded');
  });

  it("a refused download shows the server's reason", async () => {
    cvs = [{ ...fullCv('cv5', 'en'), status: 'approved' }];
    pdfReply = fail(409, 'CV_NOT_APPROVED', 'Approve the CV before downloading it as a PDF');
    await openApp('/cv-view/cv5');
    await screen.findByTestId('cv-download');
    await press('cv-download');
    expect(await screen.findByText('Approve the CV before downloading it as a PDF')).toBeTruthy();
    expect(mockShared).toHaveLength(0);
  });

  it('edit a draft: wording only, one bullet per line, shown again on the CV', async () => {
    cvs = [fullCv('cv5', 'en')];
    await openApp('/cv-view/cv5');
    await screen.findByTestId('cv-preview');
    await press('cv-edit');
    expect(screen).toHavePathname('/cv-edit/cv5');
    expect(await screen.findByTestId('cv-edit-summary')).toBeTruthy();
    expect(screen.getByTestId('cv-edit-bullets-e1').props.value).toBe('Entered survey forms.');

    // Too many lines: refused here, nothing sent.
    await type('cv-edit-bullets-e1', '1\n2\n3\n4\n5\n6\n7');
    await press('cv-edit-save');
    expect(screen.getByText('At most 6 bullet points.')).toBeTruthy();
    expect(calls.some((c) => c.route.startsWith('PATCH'))).toBe(false);

    await type('cv-edit-summary', '  Careful data clerk.  ');
    await type('cv-edit-bullets-e1', '• Checked forms weekly.\n\n- Prepared tables.');
    await press('cv-edit-save');
    expect(calls.find((c) => c.route === 'PATCH /cvs/cv5')?.body).toEqual({
      headline: 'Data clerk',
      summary: 'Careful data clerk.',
      experience: [{ id: 'e1', bullets: ['Checked forms weekly.', 'Prepared tables.'] }],
    });
    expect(screen).toHavePathname('/cv-view/cv5');
    expect(await screen.findByText('Careful data clerk.')).toBeTruthy();
    expect(screen.getByText('• Prepared tables.')).toBeTruthy();
  });

  it('edit an approved CV: a note first, then a new draft version opens', async () => {
    cvs = [{ ...fullCv('cv5', 'en'), status: 'approved' }];
    await openApp('/cv-edit/cv5');
    expect(
      await screen.findByText(
        'This CV is approved. Saving makes a new draft version; the approved one stays.',
      ),
    ).toBeTruthy();
    await type('cv-edit-summary', 'New wording.');
    await press('cv-edit-save');
    expect(screen).toHavePathname('/cv-view/cv5-v2');
    expect(await screen.findByTestId('cv-status')).toHaveTextContent('Draft');
    expect(cvs.find((c) => c.id === 'cv5')?.status).toBe('approved');
  });
});
