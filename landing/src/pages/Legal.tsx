import { pathOf, type Lang } from '../routes';
import { fmt, type Texts } from '../texts';

/** The date the privacy policy and terms were last changed (shown on both pages). */
export const LEGAL_UPDATED = '2026-11-22';

/** Privacy policy or terms of use: plain-language sections (drafts until the launch review). */
export function Legal({ t, lang, kind }: { t: Texts; lang: Lang; kind: 'privacy' | 'terms' }) {
  const doc = t.legal[kind];
  const sections = Object.entries(doc.sections) as [string, { h: string; p: string }][];
  const updated = new Intl.DateTimeFormat(lang === 'so' ? 'so' : 'en', {
    dateStyle: 'long',
  }).format(new Date(`${LEGAL_UPDATED}T12:00:00Z`));
  return (
    <section className="section legal" aria-labelledby="legal-title">
      <div className="container narrow">
        <p>
          <a href={pathOf(lang, 'home')}>{t.legal.back}</a>
        </p>
        <h1 id="legal-title">{doc.title}</h1>
        <p className="muted">{fmt(t.legal.updated, { date: updated })}</p>
        <p className="legal-draft">{t.legal.draft}</p>
        {sections.map(([key, section]) => (
          <section key={key} className="legal-section">
            <h2>{section.h}</h2>
            <p>{section.p}</p>
          </section>
        ))}
      </div>
    </section>
  );
}
