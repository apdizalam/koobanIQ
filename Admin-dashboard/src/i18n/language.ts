/** Same values as LANGUAGES in @kobaniq/shared (only its JSON files are imported here, so no build step is needed). */
export const LANGUAGES = ['en', 'so'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

export const LANGUAGE_STORAGE_KEY = 'kobaniq.admin.language';

/**
 * First language to show: the admin's last choice on this browser, else the
 * browser's own language when it is Somali, else English (architecture doc §3).
 */
export function detectLanguage(
  stored: string | null,
  browserLanguages: readonly string[],
): Language {
  if (isLanguage(stored)) return stored;
  const match = browserLanguages
    .map((tag) => tag.slice(0, 2).toLowerCase())
    .find((code) => isLanguage(code));
  return isLanguage(match) ? match : DEFAULT_LANGUAGE;
}

export function readStoredLanguage(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeLanguage(language: Language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Blocked storage: the choice just won't be remembered on this browser.
  }
}
