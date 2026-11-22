import { pathOf, type Lang } from '../routes';
import { fmt, type Texts } from '../texts';
import { Logo } from './Logo';

export function Footer({ t, lang }: { t: Texts; lang: Lang }) {
  return (
    <footer className="footer">
      <div className="container footer-row">
        <div className="footer-brand">
          <Logo size={28} />
          <span>{t.footer.tagline}</span>
        </div>
        <nav className="footer-links" aria-label={t.footer.privacy}>
          <a href={pathOf(lang, 'privacy')}>{t.footer.privacy}</a>
          <a href={pathOf(lang, 'terms')}>{t.footer.terms}</a>
        </nav>
        <p className="footer-rights">{fmt(t.footer.rights, { year: new Date().getFullYear() })}</p>
      </div>
    </footer>
  );
}
