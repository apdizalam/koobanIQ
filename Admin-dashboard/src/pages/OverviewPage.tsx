import { en } from '../i18n/en';

/** Placeholder until the Overview task (TIQ-24) adds live counts. */
export function OverviewPage() {
  return (
    <section className="card">
      <h1>{en.overview.title}</h1>
      <p className="muted">{en.overview.comingSoon}</p>
    </section>
  );
}
