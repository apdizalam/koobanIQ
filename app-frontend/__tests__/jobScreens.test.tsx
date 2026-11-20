/* eslint-disable import/no-unresolved, import/namespace, import/no-duplicates --
   expo-router/testing-library is published through the package "exports" map, which the
   lint import resolver cannot follow; TypeScript and Jest resolve it fine. */
import { act, fireEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Linking } from 'react-native';
import i18n from '../src/i18n';
import { pollSettings } from '../src/jobs/pollSettings';
import { parseLinks, storedSearchQuery } from '../src/services/jobsApi';
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
// The phone is in Somalia's time zone (schedules are saved with it).
jest.mock('expo-localization', () => ({
  ...jest.requireActual('expo-localization'),
  getCalendars: () => [{ timeZone: 'Africa/Mogadishu' }],
}));

const EMAIL = 'amina@example.com';
type Reply = { status: number; body?: unknown };
const ok = (data: unknown, status = 200): Reply => ({ status, body: { data, error: null } });

/** Synthetic jobs (never real employers). */
const job = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  sourceKey: 'career-pages',
  applyUrl: `https://boards.greenhouse.io/example/jobs/${id}`,
  sources: [],
  title,
  employer: 'Example Relief Partnership',
  employerType: 'ngo',
  region: 'somaliland',
  city: 'Hargeisa',
  jobType: 'full_time',
  workMode: null,
  deadline: '2026-12-15T00:00:00.000Z',
  postedAt: null,
  language: 'en',
  description: 'Clean and report programme data.',
  firstSeenAt: '2026-11-19T00:00:00.000Z',
  lastSeenAt: '2026-11-20T00:00:00.000Z',
  ...extra,
});
const match = (score: number, recommended: boolean, extra: Record<string, unknown> = {}) => ({
  score,
  category: score >= 75 ? 'strong' : score >= 60 ? 'good' : score >= 45 ? 'potential' : 'gap',
  recommended,
  matchedSkills: ['Excel'],
  missingRequired: recommended ? [] : ['Kobo Toolbox', 'Power BI'],
  missingPreferred: [],
  userLevel: 'junior',
  levelConfidence: 'estimated',
  jobLevel: recommended ? 'junior' : 'senior',
  levelFit: recommended ? 'fits' : 'above',
  relevantYears: 2,
  requiredYears: recommended ? 2 : 7,
  reasons: recommended
    ? [
        { key: 'skillsMatched', values: { skills: 'Excel' } },
        { key: 'level_fits', values: { jobLevel: 'junior', userLevel: 'junior', years: 2 } },
        { key: 'levelEstimated' },
        { key: 'someFutureReason' },
      ]
    : [
        { key: 'skillsMissing', values: { skills: 'Kobo Toolbox, Power BI' } },
        { key: 'level_above', values: { jobLevel: 'senior', userLevel: 'junior', years: 2 } },
        { key: 'notRecommendedLevel' },
      ],
  ...extra,
});
const GOOD = { job: job('j1', 'Data Assistant'), match: match(78, true) };
const LOWER = { job: job('j2', 'Senior M&E Manager'), match: match(30, false) };

let saved: Set<string>;
let runChecks: number;
let schedules: Record<string, unknown>[];
const calls: { route: string; query: string; body: unknown }[] = [];
let searchReply: (query: URLSearchParams) => Reply;

function api(method: string, path: string, query: URLSearchParams, body: unknown): Reply | null {
  if (path === '/auth/refresh') return ok(session(EMAIL));
  if (path === '/me') return ok({ user: user(EMAIL) });
  if (path === '/profile') {
    return ok({
      profile: {
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
        completion: 0,
      },
    });
  }
  if (path === '/skills')
    return ok({ skills: [], counts: { total: 0, assessed: 0, selfReported: 0 } });
  if (path === '/cvs') return ok({ cvs: [] });
  if (path === '/job-descriptions') return ok({ jobDescriptions: [] });
  if (path === '/jobs/search') return searchReply(query);
  if (path === '/jobs/saved') {
    return ok({ jobs: [GOOD, LOWER].filter((j) => saved.has(j.job.id)) });
  }
  if (path === '/job-sources') {
    return ok({
      sources: [
        {
          key: 'career-pages',
          name: 'Company & NGO career pages (your links)',
          type: 'employer',
          regions: ['somaliland', 'somalia', 'remote'],
          website: null,
          attribution: null,
          acceptsUrls: true,
          status: 'operational',
        },
      ],
      unavailable: [
        {
          key: 'linkedin',
          name: 'LinkedIn',
          type: 'job_board',
          regions: ['somaliland'],
          website: null,
          status: 'unavailable',
          reason: 'no_free_api',
        },
      ],
    });
  }
  if (method === 'POST' && path === '/research/run') {
    return ok({ run: { id: 'r1', status: 'running' } }, 202);
  }
  // Scheduled searches (TIQ-21), like the server: next run planned, off = no next run.
  if (path === '/research/schedules') {
    if (method === 'GET') return ok({ schedules });
    const b = body as Record<string, unknown>;
    const s = {
      id: `s${schedules.length + 1}`,
      ...b,
      weekday: b.weekday ?? null,
      filters: b.filters ?? {},
      customUrls: b.customUrls ?? [],
      enabled: true,
      nextRunAt: '2026-11-21T06:00:00.000Z',
      lastRunAt: '2026-11-20T06:00:00.000Z',
      lastRunId: 'r1',
      lastSkip: 'no_sources',
      runCount: 1,
      createdAt: '2026-11-20T09:00:00.000Z',
    };
    schedules.push(s);
    return ok({ schedule: s }, 201);
  }
  const sched = /^\/research\/schedules\/(s\d+)$/.exec(path);
  if (sched) {
    const s = schedules.find((x) => x.id === sched[1])!;
    if (method === 'DELETE') {
      schedules = schedules.filter((x) => x !== s);
      return { status: 204 };
    }
    const enabled = (body as { enabled: boolean }).enabled;
    Object.assign(s, { enabled, nextRunAt: enabled ? '2026-11-21T06:00:00.000Z' : null });
    return ok({ schedule: s });
  }
  if (path === '/research/runs/r1') {
    runChecks += 1;
    const done = runChecks >= 2;
    return ok({
      run: {
        id: 'r1',
        status: done ? 'partial' : 'running',
        sourceKeys: ['career-pages'],
        regions: ['somaliland', 'somalia'],
        customUrls: ['https://boards.greenhouse.io/example'],
        perSource: done
          ? [
              {
                key: 'career-pages',
                queried: true,
                found: 2,
                invalid: 0,
                new: 2,
                duplicates: 0,
                attempts: 1,
                error: null,
                durationMs: 900,
              },
            ]
          : [],
        jobsFound: done ? 2 : 0,
        jobsNew: done ? 2 : 0,
        duplicates: 0,
        error: null,
        startedAt: '2026-11-20T09:00:00.000Z',
        finishedAt: done ? '2026-11-20T09:00:05.000Z' : null,
      },
      recommended: done ? [GOOD] : [],
      lowerMatch: done ? [LOWER] : [],
      hiddenByFilters: done ? 3 : 0,
    });
  }
  const one = /^\/jobs\/(j\d)(\/save)?$/.exec(path);
  if (one) {
    const item = [GOOD, LOWER].find((j) => j.job.id === one[1])!;
    if (one[2]) {
      if (method === 'PUT') saved.add(one[1]);
      else saved.delete(one[1]);
      return { status: 204 };
    }
    return ok({ ...item, saved: saved.has(one[1]) });
  }
  void body;
  return null;
}

beforeEach(() => {
  mockSecureStore.clear();
  mockSecureStore.set('kobaniq.refreshToken', 'saved-1');
  saved = new Set();
  runChecks = 0;
  schedules = [];
  calls.length = 0;
  pollSettings.intervalMs = 10;
  searchReply = (query) =>
    ok({
      regions: ['somaliland', 'somalia'],
      searched: 2,
      recommended: [GOOD],
      lowerMatch: query.get('lower') === '1' ? [LOWER] : [],
      counts: { recommended: 1, lowerMatch: 1 },
    });
  globalThis.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const parsed = new URL(url);
    const path = parsed.pathname.replace('/api/v1', '');
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ route: `${method} ${path}`, query: parsed.search, body });
    const reply = api(method, path, parsed.searchParams, body);
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

async function openApp(url: string, ready = 'jobs-screen') {
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

describe('TIQ-18: job search helpers', () => {
  it('builds the stored-search query, leaving out empty filters', () => {
    expect(storedSearchQuery({})).toBe('');
    expect(
      storedSearchQuery({ q: ' data & M&E ', regions: ['somalia'], jobTypes: [], lower: true }),
    ).toBe('?q=data%20%26%20M%26E&regions=somalia&lower=1');
    expect(
      storedSearchQuery({ city: ' Hargeisa ', employerTypes: ['ngo', 'un_agency'], jobTypes: [] }),
    ).toBe('?city=Hargeisa&employerTypes=ngo%2Cun_agency');
  });

  it('reads career-page links one per line, without repeats', () => {
    expect(
      parseLinks('https://a.example/jobs\n\n https://b.example , https://a.example/jobs'),
    ).toEqual(['https://a.example/jobs', 'https://b.example']);
  });
});

describe('TIQ-18: Jobs tab', () => {
  it('method A: searches stored jobs; lower matches only when asked, in their own section', async () => {
    await openApp('/jobs');
    await type('jobs-q', 'data');
    await press('search-region-somalia');
    await press('search-jobtype-full_time');
    await type('search-city', 'Hargeisa');
    await press('search-employer-ngo');
    await press('search-employer-un_agency');
    await press('jobs-search');

    const search = calls.find((c) => c.route === 'GET /jobs/search')!;
    expect(search.query).toBe(
      '?q=data&regions=somalia&city=Hargeisa&employerTypes=ngo%2Cun_agency&jobTypes=full_time',
    );
    expect(screen.getByTestId('job-rec-j1')).toBeTruthy();
    expect(screen.getByText('1 job that fits you')).toBeTruthy();
    // Why it matched, in words (an unknown reason key is left out, not shown raw).
    expect(
      screen.getByText(
        'You have skills it asks for: Excel. Your level (Junior) fits this Junior job.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/someFutureReason/)).toBeNull();
    expect(
      screen.getAllByText(
        'The score shows how relevant the job is to your profile, not your chance of being hired.',
      ).length,
    ).toBeGreaterThan(0);
    // The lower match is not shown (nor loaded) until asked for.
    expect(screen.queryByTestId('job-low-j2')).toBeNull();
    expect(search.query).not.toContain('lower');

    await press('jobs-show-lower');
    expect(calls.filter((c) => c.route === 'GET /jobs/search').pop()!.query).toContain('lower=1');
    expect(screen.getByTestId('jobs-lower-section')).toBeTruthy();
    expect(screen.getByTestId('job-low-j2')).toBeTruthy();
  });

  it('method A: says honestly when nothing fits, and when nothing is stored', async () => {
    searchReply = () =>
      ok({
        regions: ['somaliland'],
        searched: 1,
        recommended: [],
        lowerMatch: [],
        counts: { recommended: 0, lowerMatch: 1 },
      });
    await openApp('/jobs');
    await press('jobs-search');
    expect(screen.getByTestId('jobs-none-suitable')).toBeTruthy();
    expect(screen.getByText('No suitable jobs found')).toBeTruthy();
    expect(screen.getByTestId('jobs-show-lower')).toBeTruthy();

    searchReply = () =>
      ok({
        regions: ['somaliland'],
        searched: 0,
        recommended: [],
        lowerMatch: [],
        counts: { recommended: 0, lowerMatch: 0 },
      });
    await press('jobs-search');
    expect(screen.getByTestId('jobs-none-stored')).toBeTruthy();
    expect(screen.queryByTestId('jobs-none-suitable')).toBeNull();
  });

  it('method B: unavailable sources show their reason and cannot be chosen; links are required', async () => {
    await openApp('/jobs');
    await press('jobs-mode-research');
    expect(screen.getByTestId('source-career-pages')).toBeTruthy();
    expect(calls.find((c) => c.route === 'GET /job-sources')!.query).toBe(
      '?regions=somaliland,somalia',
    );
    // Listed with the reason, no checkbox.
    expect(screen.getByTestId('source-unavailable-linkedin')).toBeTruthy();
    expect(
      screen.getByText(
        'No free, permitted way to read its public jobs; KOBANIQ does not search it.',
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId('source-linkedin')).toBeNull();

    expect(screen.getByTestId('jobs-start').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await press('source-career-pages');
    // Career pages need at least one link before the search can start.
    expect(screen.getByTestId('jobs-start').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await type('jobs-links', 'https://boards.greenhouse.io/example');
    await type('jobs-title', 'Data assistant');
    await type('research-city', 'Hargeisa');
    await press('research-employer-ngo');
    await press('jobs-start');

    expect(calls.find((c) => c.route === 'POST /research/run')!.body).toEqual({
      sourceKeys: ['career-pages'],
      regions: ['somaliland', 'somalia'],
      filters: { titles: ['Data assistant'], city: 'Hargeisa', employerTypes: ['ngo'] },
      customUrls: ['https://boards.greenhouse.io/example'],
    });
    // Progress screen: running first, checked again on a timer until finished.
    expect(screen.getByTestId('run-running')).toBeTruthy();
    expect(screen.queryByTestId('run-summary')).toBeNull();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(pollSettings.intervalMs + 5);
    });
    // Finished: results (lower ones hidden).
    expect(screen.getByTestId('run-summary')).toBeTruthy();
    expect(runChecks).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText('Some sources could not be read; the others were checked.'),
    ).toBeTruthy();
    expect(screen.getByText('2 jobs found (2 not seen before)')).toBeTruthy();
    expect(screen.getByTestId('run-hidden').props.children).toBe(
      '3 jobs found did not match your filters (they are kept for later searches).',
    );
    expect(screen.getByTestId('job-rec-j1')).toBeTruthy();
    expect(screen.queryByTestId('job-low-j2')).toBeNull();
    await press('jobs-show-lower');
    expect(screen.getByTestId('job-low-j2')).toBeTruthy();
  });

  it('save from a card shows in Saved; the job detail is honest about dates, level and fit', async () => {
    await openApp('/jobs');
    await press('jobs-search');
    await press('job-rec-j1-save');
    expect(calls.some((c) => c.route === 'PUT /jobs/j1/save')).toBe(true);
    await press('jobs-mode-saved');
    expect(screen.getByTestId('jobs-saved-list')).toBeTruthy();
    expect(screen.getByText('1 saved job')).toBeTruthy();

    await act(async () => {
      renderRouter('./src/app', { initialUrl: '/job/j2' });
    });
    expect(screen.getByTestId('job-why')).toBeTruthy();
    expect(
      screen.getByText('This job does not fit your profile well. See why below.'),
    ).toBeTruthy();
    expect(screen.getByText('Kobo Toolbox')).toBeTruthy();
    expect(screen.getByTestId('job-level-confidence')).toBeTruthy();
    // No publication date from the source: says so, never "new".
    expect(screen.getByTestId('job-posted').props.children).toMatch(
      /^The source gives no publication date\. KOBANIQ first found it on /,
    );
    expect(screen.getByTestId('job-source').props.children).toBe(
      'Source: Company & NGO career pages (boards.greenhouse.io)',
    );
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await press('job-apply');
    expect(open).toHaveBeenCalledWith('https://boards.greenhouse.io/example/jobs/j2');
    await press('job-save');
    expect(calls.some((c) => c.route === 'PUT /jobs/j2/save')).toBe(true);
    expect(screen.getByTestId('job-save')).toBeTruthy();
  });

  it('shows the Somali texts', async () => {
    await openApp('/jobs');
    await act(async () => {
      await i18n.changeLanguage('so');
    });
    expect(screen.getByText('Hel shaqooyin cusub')).toBeTruthy();
  });
});

describe('TIQ-21: scheduled searches', () => {
  it('saves a weekly schedule in the phone’s time zone instead of searching now', async () => {
    await openApp('/jobs');
    await press('jobs-mode-research');
    await press('source-career-pages');
    await type('jobs-links', 'https://boards.greenhouse.io/example');
    await press('jobs-repeat');
    expect(screen.getByText('Save schedule')).toBeTruthy();
    await press('jobs-frequency-weekly');
    await press('jobs-weekday-2');
    // A time that is not a time blocks saving.
    await type('jobs-repeat-time', '25:00');
    expect(screen.getByTestId('jobs-start').props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await type('jobs-repeat-time', '9:30');
    await press('jobs-start');

    const post = calls.find((c) => c.route === 'POST /research/schedules')!;
    expect(post.body).toEqual({
      sourceKeys: ['career-pages'],
      regions: ['somaliland', 'somalia'],
      customUrls: ['https://boards.greenhouse.io/example'],
      frequency: 'weekly',
      time: '09:30',
      weekday: 2,
      timeZone: 'Africa/Mogadishu',
    });
    // No search was started now; the schedule list is shown.
    expect(calls.some((c) => c.route === 'POST /research/run')).toBe(false);
    expect(screen.getByTestId('jobs-schedule-saved')).toBeTruthy();
    expect(screen.getByText('Every Wed at 09:30 (Africa/Mogadishu)')).toBeTruthy();
    expect(screen.getByTestId('schedule-s1-next').props.children).toMatch(/^Next search: /);
    expect(screen.getByTestId('schedule-s1-skip').props.children).toBe(
      'Last time it did not run: its job sources are switched off right now.',
    );
  });

  it('switching a schedule off shows it will not run; delete removes it', async () => {
    schedules = [
      {
        id: 's1',
        frequency: 'daily',
        time: '08:00',
        weekday: null,
        timeZone: 'Africa/Mogadishu',
        sourceKeys: ['career-pages'],
        regions: ['somaliland'],
        filters: {},
        customUrls: [],
        enabled: true,
        nextRunAt: '2026-11-21T05:00:00.000Z',
        lastRunAt: null,
        lastRunId: null,
        lastSkip: null,
        runCount: 0,
        createdAt: '2026-11-20T09:00:00.000Z',
      },
    ];
    await openApp('/jobs');
    await press('jobs-mode-schedules');
    expect(screen.getByText('Every day at 08:00 (Africa/Mogadishu)')).toBeTruthy();
    await press('schedule-s1-enabled');
    expect(calls.find((c) => c.route === 'PATCH /research/schedules/s1')!.body).toEqual({
      enabled: false,
    });
    expect(screen.getByTestId('schedule-s1-next').props.children).toBe(
      'Switched off: it will not run.',
    );
    await press('schedule-s1-delete');
    expect(calls.some((c) => c.route === 'DELETE /research/schedules/s1')).toBe(true);
    expect(screen.queryByTestId('schedule-s1')).toBeNull();
    expect(screen.getByText('No scheduled searches')).toBeTruthy();
  });
});
