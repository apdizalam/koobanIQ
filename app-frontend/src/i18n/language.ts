/** Same values as LANGUAGES in @kobaniq/shared (only its JSON files are imported, so no build step is needed). */
export const LANGUAGES = ['en', 'so'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

/** First language: the phone's language when it is Somali, otherwise English (architecture doc §3). */
export function detectLanguage(deviceLanguageCodes: readonly (string | null)[]): Language {
  const match = deviceLanguageCodes.find((code) => isLanguage(code?.toLowerCase()));
  return isLanguage(match?.toLowerCase()) ? (match!.toLowerCase() as Language) : DEFAULT_LANGUAGE;
}
