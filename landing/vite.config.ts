import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import en from '../packages/shared/i18n/en.json' with { type: 'json' };
import so from '../packages/shared/i18n/so.json' with { type: 'json' };
import { LANGS, PAGES, fileOf, parsePath, pathOf, type Lang, type Page } from './src/routes.ts';

const TEXTS = { en: en.landing.meta, so: so.landing.meta };

/** The page's own <head> values: language, title, description, links to both languages. */
function headFor(lang: Lang, page: Page, siteUrl: string): Record<string, string> {
  const meta = TEXTS[lang];
  const url = (l: Lang) => `${siteUrl}${pathOf(l, page)}`;
  return {
    '%LANG%': lang,
    '%TITLE%':
      page === 'privacy' ? meta.privacyTitle : page === 'terms' ? meta.termsTitle : meta.title,
    '%DESCRIPTION%': meta.description,
    '%CANONICAL%': url(lang),
    '%HREF_EN%': url('en'),
    '%HREF_SO%': url('so'),
    '%OG_IMAGE%': `${siteUrl}/icon.png`,
    '%OG_LOCALE%': lang === 'so' ? 'so_SO' : 'en_US',
  };
}

const escapeAttr = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const fill = (html: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (out, [key, value]) => out.split(key).join(escapeAttr(value)),
    html,
  );

/**
 * One HTML file per page and language (TIQ-34): the built index.html is copied
 * to so/, privacy/, so/terms/ … with that page's language and head tags, so
 * any static host serves the right page and search engines see both languages.
 */
function pages(siteUrl: string): Plugin {
  let outDir = 'dist';
  let isSsr = false;
  return {
    name: 'kobaniq-landing-pages',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
      isSsr = Boolean(config.build.ssr);
    },
    // After Vite has written dist/index.html: fill it once per page and language.
    closeBundle() {
      if (isSsr) return; // the server bundle (pre-rendering) has no HTML
      const template = readFileSync(join(outDir, 'index.html'), 'utf8');
      for (const lang of LANGS) {
        for (const page of PAGES) {
          const file = join(outDir, fileOf(lang, page));
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, fill(template, headFor(lang, page, siteUrl)));
        }
      }
    },
  };
}

/** The dev server fills the page it is asked for (every path is served from index.html). */
function devHead(siteUrl: string): Plugin {
  return {
    name: 'kobaniq-landing-dev-head',
    apply: 'serve',
    transformIndexHtml(html, ctx) {
      const { lang, page } = parsePath(ctx.originalUrl?.split('?')[0] ?? '/');
      return fill(html, headFor(lang, page, siteUrl));
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Public address of the site, for canonical / hreflang / Open Graph links.
  // Set VITE_SITE_URL when it is deployed (TIQ-25); until then the links are relative.
  const siteUrl = (loadEnv(mode, process.cwd()).VITE_SITE_URL ?? '').replace(/\/$/, '');
  return {
    plugins: [react(), pages(siteUrl), devHead(siteUrl)],
  };
});
