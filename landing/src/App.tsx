import { useEffect } from 'react';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { Home } from './pages/Home';
import { Legal } from './pages/Legal';
import { parsePath } from './routes';
import { TEXTS } from './texts';

/**
 * KOBANIQ landing site (TIQ-34). The page and language come from the address
 * (/, /privacy, /terms, and the same under /so/); links between pages are
 * ordinary links, each page being its own HTML file. `path` is passed in so
 * the build can render every page to HTML ahead of time (scripts/prerender.mjs).
 */
export default function App({ path }: { path: string }) {
  const { lang, page } = parsePath(path);
  const t = TEXTS[lang];

  useEffect(() => {
    // The built HTML already has these; keep them right in the dev server too.
    document.documentElement.lang = lang;
    document.title =
      page === 'privacy'
        ? t.meta.privacyTitle
        : page === 'terms'
          ? t.meta.termsTitle
          : t.meta.title;
  }, [lang, page, t]);

  return (
    <>
      <a className="skip-link" href="#main">
        {t.nav.skip}
      </a>
      <Header t={t} lang={lang} page={page} />
      <main id="main">
        {page === 'home' ? <Home t={t} lang={lang} /> : <Legal t={t} lang={lang} kind={page} />}
      </main>
      <Footer t={t} lang={lang} />
    </>
  );
}
