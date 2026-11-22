import { describe, expect, it, vi } from 'vitest';
import { fileOf, parsePath, pathOf, LANGS, PAGES } from './routes';
import { TEXTS, fmt } from './texts';
import { formProblem, joinWaitlist, type WaitlistForm } from './waitlistApi';

const form = (over: Partial<WaitlistForm> = {}): WaitlistForm => ({
  email: 'amina@example.invalid',
  name: '',
  consent: true,
  website: '',
  ...over,
});

describe('pages and languages (TIQ-34)', () => {
  it('maps every page in both languages to an address and back', () => {
    expect(pathOf('en', 'home')).toBe('/');
    expect(pathOf('so', 'home')).toBe('/so/');
    expect(pathOf('so', 'privacy')).toBe('/so/privacy');
    for (const lang of LANGS) {
      for (const page of PAGES) expect(parsePath(pathOf(lang, page))).toEqual({ lang, page });
    }
    expect(parsePath('/so/terms/')).toEqual({ lang: 'so', page: 'terms' });
    expect(parsePath('/privacy/index.html')).toEqual({ lang: 'en', page: 'privacy' });
    expect(parsePath('/unknown')).toEqual({ lang: 'en', page: 'home' });
  });

  it('builds one HTML file per page and language', () => {
    expect(fileOf('en', 'home')).toBe('index.html');
    expect(fileOf('so', 'home')).toBe('so/index.html');
    expect(fileOf('en', 'terms')).toBe('terms/index.html');
    expect(fileOf('so', 'privacy')).toBe('so/privacy/index.html');
  });
});

/** Every text of an object tree, with its path. */
function leaves(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leaves(v, path ? `${path}.${k}` : k),
  );
}

describe('texts', () => {
  it('every section is translated: the same texts exist in English and Somali, none empty', () => {
    const en = leaves(TEXTS.en);
    const so = new Map(leaves(TEXTS.so));
    expect(en.length).toBeGreaterThan(80);
    for (const [path, text] of en) {
      expect(text.trim(), path).not.toBe('');
      expect(so.get(path)?.trim(), `so: ${path}`).toBeTruthy();
    }
  });

  it('End Test: no pricing or plan content anywhere', () => {
    const forbidden =
      /\$|€|£|\busd\b|\bprice|\bpricing\b|\bpremium\b|\bper month\b|\/month|\bpro plan\b|\bbilaha\b|\blacagta bixinta\b/i;
    for (const lang of LANGS) {
      for (const [path, text] of leaves(TEXTS[lang])) {
        expect(forbidden.test(text), `${lang}: ${path}: ${text}`).toBe(false);
      }
    }
  });

  it('fills placeholders', () => {
    expect(fmt('© {{year}} KOBANIQ', { year: 2026 })).toBe('© 2026 KOBANIQ');
    expect(fmt('{{missing}}', {})).toBe('{{missing}}');
  });
});

describe('waitlist form', () => {
  it('checks the email and the agreement before sending', () => {
    expect(formProblem(form())).toBeNull();
    expect(formProblem(form({ email: 'not-an-email' }))).toBe('emailInvalid');
    expect(formProblem(form({ consent: false }))).toBe('consentMissing');
  });

  it('sends the form in the page language; trims; leaves out an empty name', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const result = await joinWaitlist(
      form({ email: '  amina@example.invalid ' }),
      'so',
      fetcher as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: true });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toMatch(/\/waitlist$/);
    expect(init.headers['Accept-Language']).toBe('so');
    expect(JSON.parse(init.body)).toEqual({
      email: 'amina@example.invalid',
      language: 'so',
      consent: true,
      website: '',
    });
  });

  it("shows the server's own message (e.g. already on the list), or a general one offline", async () => {
    const duplicate = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: 'This email is already on the waitlist.' } }),
    });
    expect(await joinWaitlist(form(), 'en', duplicate as unknown as typeof fetch)).toEqual({
      ok: false,
      message: 'This email is already on the waitlist.',
    });
    const offline = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await joinWaitlist(form(), 'en', offline as unknown as typeof fetch)).toEqual({
      ok: false,
      message: null,
    });
  });
});
