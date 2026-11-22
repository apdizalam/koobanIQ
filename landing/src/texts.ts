// Only the `landing` part of the shared translation files is bundled (Vite
// keeps just the top-level JSON keys that are imported), so the page stays small.
import { landing as en } from '@kobaniq/shared/i18n/en.json';
import { landing as so } from '@kobaniq/shared/i18n/so.json';
import type { Lang } from './routes';

export type Texts = typeof en;

/** All landing page texts in one language (same keys in both, checked by the shared i18n test). */
export const TEXTS: Record<Lang, Texts> = { en, so };

/** Fills {{name}} placeholders, e.g. fmt('© {{year}} KOBANIQ', { year: 2026 }). */
export const fmt = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
