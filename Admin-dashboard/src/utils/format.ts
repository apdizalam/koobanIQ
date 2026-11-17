/** Date (and optionally time) in the admin's language, e.g. "17 Nov 2026, 14:10". */
export function formatDate(iso: string, language: string, withTime = false): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(new Date(iso));
}
