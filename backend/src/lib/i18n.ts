import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Request } from 'express';
import { LANGUAGES, type Language } from '../models/User.js';

/**
 * Server texts come from the shared translation files (packages/shared/i18n),
 * the same ones the mobile app and admin use. Read from the repository at start-up
 * (src/lib and dist/lib are both three folders below the repository root).
 */
const I18N_DIR = join(__dirname, '..', '..', '..', 'packages', 'shared', 'i18n');

type Tree = { [key: string]: string | Tree };
const load = (language: Language) =>
  JSON.parse(readFileSync(join(I18N_DIR, `${language}.json`), 'utf8')) as Tree;
const texts: Record<Language, Tree> = { en: load('en'), so: load('so') };

function lookup(tree: Tree, key: string): string | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Text for `key` in `language` (English if missing), with {{placeholders}} filled in. */
export function translate(
  language: Language,
  key: string,
  vars: Record<string, string | number> = {},
): string | undefined {
  const text = lookup(texts[language], key) ?? lookup(texts.en, key);
  return text?.replace(/{{\s*(\w+)\s*}}/g, (all, name: string) => String(vars[name] ?? all));
}

const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

/** Best supported language in an Accept-Language header ("so-SO,so;q=0.9,en;q=0.8"). */
export function languageFromHeader(header: string | undefined): Language | undefined {
  if (!header) return undefined;
  return header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { code: tag.slice(0, 2).toLowerCase(), q: q ? Number(q.split('=')[1]) : 1, index };
    })
    .filter((entry) => isLanguage(entry.code) && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((entry) => entry.code as Language)[0];
}

/**
 * The language for this request (architecture doc §2 `locale`): the signed-in
 * user's saved language, else the Accept-Language header, else English.
 */
export function requestLanguage(req: Request): Language {
  return req.user?.preferredLanguage ?? languageFromHeader(req.get('accept-language')) ?? 'en';
}
