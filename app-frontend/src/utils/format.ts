/**
 * A date in the app language, e.g. "18 Nov 2026" (PRD FR-I18N-08). Falls back
 * to English month names where the phone has no Somali date data.
 */
export function formatDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
  }
}

/** A date and time in the app language, e.g. "21 Nov 2026, 09:00" (English month names as fallback). */
export function formatDateTime(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const options = { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' } as const;
  try {
    return new Intl.DateTimeFormat(language, options).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', options).format(date);
  }
}
