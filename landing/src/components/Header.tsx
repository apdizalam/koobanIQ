import { LANGS, pathOf, type Lang, type Page } from '../routes';
import type { Texts } from '../texts';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

const LANG_NAMES: Record<Lang, string> = { en: 'English', so: 'Soomaali' };

/** Top bar: logo, section links (home page), light/dark switch, language switcher, waitlist button. */
export function Header({ t, lang, page }: { t: Texts; lang: Lang; page: Page }) {
  const home = pathOf(lang, 'home');
  // On the legal pages the section links lead back to the home page.
  const section = (id: string) => (page === 'home' ? `#${id}` : `${home}#${id}`);
  return (
    <header className="header">
      <div className="container header-row">
        <a className="brand" href={home} aria-label={t.nav.home}>
          <Logo size={34} />
          <span>KOBANIQ</span>
        </a>
        <nav className="nav" aria-label={t.nav.menu}>
          <a href={section('how')}>{t.nav.how}</a>
          <a href={section('features')}>{t.nav.features}</a>
          <a href={section('faq')}>{t.nav.faq}</a>
        </nav>
        <div className="header-actions">
          <ThemeToggle label={t.nav.darkMode} />
          <div className="lang-switch" role="group" aria-label={t.nav.language}>
            {LANGS.map((l) => (
              <a
                key={l}
                href={pathOf(l, page)}
                hrefLang={l}
                lang={l}
                aria-current={l === lang ? 'true' : undefined}
                className={l === lang ? 'active' : undefined}
              >
                {LANG_NAMES[l]}
              </a>
            ))}
          </div>
          <a className="button button-primary button-small header-join" href={section('waitlist')}>
            {t.nav.join}
          </a>
        </div>
      </div>
    </header>
  );
}
