import { describe, expect, it } from 'vitest';
import { detectLanguage } from './language';
import { resources } from './index';

describe('detectLanguage', () => {
  it('uses the language the admin chose before', () => {
    expect(detectLanguage('so', ['en-US'])).toBe('so');
    expect(detectLanguage('en', ['so-SO'])).toBe('en');
  });

  it('otherwise uses the browser language when it is Somali', () => {
    expect(detectLanguage(null, ['so-SO', 'en'])).toBe('so');
    expect(detectLanguage(null, ['fr-FR', 'so'])).toBe('so');
  });

  it('falls back to English', () => {
    expect(detectLanguage(null, ['fr-FR', 'ar'])).toBe('en');
    expect(detectLanguage('de', [])).toBe('en');
  });
});

describe('shared translation files', () => {
  const keys = (obj: object, prefix = ''): string[] =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
    );

  it('Somali has exactly the same keys as English', () => {
    expect(keys(resources.so.translation).sort()).toEqual(keys(resources.en.translation).sort());
  });
});
