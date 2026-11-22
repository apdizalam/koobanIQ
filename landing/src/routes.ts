/**
 * The landing site's pages (TIQ-34). English lives at the root, Somali under
 * /so/; each page is also built as its own HTML file (vite.config.ts) so it
 * works on any static host and search engines see the right language.
 */
export type Lang = 'en' | 'so';
export type Page = 'home' | 'privacy' | 'terms';

export const PAGES: Page[] = ['home', 'privacy', 'terms'];
export const LANGS: Lang[] = ['en', 'so'];

/** "/", "/privacy", "/so/", "/so/terms" … */
export function pathOf(lang: Lang, page: Page): string {
  const prefix = lang === 'so' ? '/so' : '';
  return page === 'home' ? `${prefix}/` : `${prefix}/${page}`;
}

/** The page and language a path stands for (unknown paths → English home). */
export function parsePath(pathname: string): { lang: Lang; page: Page } {
  const parts = pathname
    .replace(/\/index\.html$/, '')
    .split('/')
    .filter(Boolean);
  const lang: Lang = parts[0] === 'so' ? 'so' : 'en';
  const rest = lang === 'so' ? parts.slice(1) : parts;
  const page = PAGES.find((p) => p !== 'home' && p === rest[0]) ?? 'home';
  return { lang, page };
}

/** Where each built page goes in dist/ (for the HTML files). */
export function fileOf(lang: Lang, page: Page): string {
  const path = pathOf(lang, page);
  return path.endsWith('/') ? `${path.slice(1)}index.html` : `${path.slice(1)}/index.html`;
}
