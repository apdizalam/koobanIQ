/**
 * Light / dark theme. public/theme-init.js sets <html data-theme> before the
 * page is drawn; this module reads and changes it. The choice is kept in this
 * browser only (localStorage, shared with the admin dashboard on the same site).
 */
export type Theme = 'light' | 'dark';
export const THEME_KEY = 'kobaniq-theme';

export const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark';

/** The theme on screen now (what theme-init.js chose). */
export function currentTheme(doc?: Document): Theme {
  const d = doc ?? (typeof document === 'undefined' ? null : document);
  const value = d?.documentElement.getAttribute('data-theme');
  return isTheme(value) ? value : 'light';
}

/** Shows `theme` and remembers it (storage may be blocked: then it lasts for this page only). */
export function setTheme(theme: Theme, doc: Document = document, storage?: Storage) {
  doc.documentElement.setAttribute('data-theme', theme);
  try {
    (storage ?? window.localStorage).setItem(THEME_KEY, theme);
  } catch {
    // Private mode or blocked storage: the switch still works until the page closes.
  }
}
