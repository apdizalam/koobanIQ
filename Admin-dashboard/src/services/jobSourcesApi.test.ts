import { describe, expect, it, vi } from 'vitest';
import type { AuthState } from '../auth/authContext';
import { resources } from '../i18n';
import type { AdminJobSource } from '../types/jobSources';
import {
  enableBlocker,
  errorPercent,
  parseCityLines,
  parsePriority,
  sourceChanges,
  updateJobSource,
  updateRegionCities,
} from './jobSourcesApi';

const source = (over: Partial<AdminJobSource> = {}): AdminJobSource => ({
  key: 'test-board',
  name: 'Test board',
  type: 'job_board',
  regions: ['somaliland'],
  employerTypes: ['company'],
  languages: ['en'],
  logoUrl: null,
  website: null,
  connection: 'api',
  enabled: false,
  priority: 100,
  termsUrl: null,
  termsCheckedAt: '2026-11-18T00:00:00.000Z',
  rateLimitPerMinute: null,
  lastSuccessAt: null,
  errorRate: 0,
  updatedAt: '2026-11-18T00:00:00.000Z',
  hasAdapter: true,
  ...over,
});

describe('enableBlocker', () => {
  it('blocks switching on until the terms were checked (doc 9 §3)', () => {
    expect(enableBlocker(source({ termsCheckedAt: null }))).toBe('terms');
  });

  it('blocks switching on when the server has no adapter', () => {
    expect(enableBlocker(source({ hasAdapter: false }))).toBe('adapter');
  });

  it('allows a checked source with an adapter, and never blocks switching off', () => {
    expect(enableBlocker(source())).toBeNull();
    expect(enableBlocker(source({ enabled: true, termsCheckedAt: null }))).toBeNull();
  });
});

describe('sourceChanges', () => {
  it('sends only what changed (list order does not matter)', () => {
    const s = source({ regions: ['somaliland', 'somalia'] });
    expect(
      sourceChanges(s, {
        regions: ['somalia', 'somaliland'],
        employerTypes: ['company'],
        priority: 100,
      }),
    ).toEqual({});
    expect(
      sourceChanges(s, { regions: ['somalia'], employerTypes: ['ngo', 'company'], priority: 5 }),
    ).toEqual({ regions: ['somalia'], employerTypes: ['ngo', 'company'], priority: 5 });
  });
});

describe('parsePriority', () => {
  it('accepts whole numbers 0–1000 only', () => {
    expect(parsePriority(' 0 ')).toBe(0);
    expect(parsePriority('1000')).toBe(1000);
    expect(parsePriority('1001')).toBeNull();
    expect(parsePriority('-1')).toBeNull();
    expect(parsePriority('2.5')).toBeNull();
    expect(parsePriority('')).toBeNull();
  });
});

describe('parseCityLines', () => {
  it('trims, drops empty lines and repeats in any letter case', () => {
    expect(parseCityLines(' Hargeisa \r\n\nhargeisa\nBerbera\n')).toEqual({
      cities: ['Hargeisa', 'Berbera'],
      problem: null,
    });
  });

  it('flags what the server would refuse', () => {
    expect(parseCityLines('x'.repeat(61)).problem).toBe('tooLong');
    const many = Array.from({ length: 101 }, (_, i) => `City ${i}`).join('\n');
    expect(parseCityLines(many).problem).toBe('tooMany');
    expect(parseCityLines('').cities).toEqual([]);
  });
});

describe('errorPercent', () => {
  it('turns 0–1 into a whole percent', () => {
    expect(errorPercent(0)).toBe(0);
    expect(errorPercent(0.488)).toBe(49);
    expect(errorPercent(1.2)).toBe(100);
  });
});

describe('requests', () => {
  it('PATCHes the right paths with the right bodies', async () => {
    const request = vi.fn(async (path: string) =>
      path.includes('regions') ? { region: { key: 'somalia', cities: [] } } : { source: source() },
    );
    const send = request as unknown as AuthState['request'];
    await updateJobSource(send, 'test board', { enabled: true });
    await updateRegionCities(send, 'somalia', ['Garowe']);
    expect(request.mock.calls).toEqual([
      ['/admin/job-sources/test%20board', { method: 'PATCH', body: { enabled: true } }],
      ['/admin/regions/somalia', { method: 'PATCH', body: { cities: ['Garowe'] } }],
    ]);
  });
});

describe('texts', () => {
  it('every source type, region and employer type has English and Somali text', () => {
    for (const lang of ['en', 'so'] as const) {
      const tr = resources[lang].translation;
      for (const type of ['job_board', 'ngo_un', 'employer', 'government', 'partner'] as const) {
        expect(tr.admin.sources.types[type]).toBeTruthy();
      }
      expect(Object.keys(tr.common.region)).toEqual(['somaliland', 'somalia', 'remote']);
      expect(Object.keys(tr.common.employerType)).toHaveLength(7);
    }
  });
});
