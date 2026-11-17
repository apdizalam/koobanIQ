import { useSearchParams } from 'react-router';
import { PeriodSwitch } from '../components/ui/PeriodSwitch';
import { SoonCard, StatCard } from '../components/ui/StatCard';
import { useOverview } from '../hooks/useOverview';
import { en } from '../i18n/en';
import { isPeriod, type Period } from '../types/overview';

const t = en.overview;
const SOON_KEYS = ['assessments', 'cvs', 'runs', 'failedJobs', 'aiUsage'] as const;

/** Admin Overview: live user numbers + cards for features that are not built yet. */
export function OverviewPage() {
  // The period lives in the address (?period=month), so a reload or a shared link keeps it.
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('period');
  const period: Period = isPeriod(fromUrl) ? fromUrl : 'week';
  const setPeriod = (next: Period) =>
    setParams(next === 'week' ? {} : { period: next }, { replace: true });

  const { state, reload } = useOverview(period);
  const data = state.status === 'ready' ? state.data : null;
  const value = (n: number | undefined) => (state.status === 'loading' ? null : (n ?? 0));
  const hint = t.periodHint[period];

  return (
    <>
      <header className="page-header page-header-row">
        <div className="page-title">
          <h1>{t.title}</h1>
          <p className="muted">
            {t.subtitle}
            {data ? ` ${t.updatedAt} ${new Date(data.generatedAt).toLocaleTimeString()}.` : null}
          </p>
        </div>
        <PeriodSwitch
          value={period}
          onChange={setPeriod}
          labels={t.periods}
          label={t.periodLabel}
        />
      </header>

      {state.status === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t.error}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t.retry}
          </button>
        </div>
      ) : (
        <>
          {data && data.users.total === 0 ? (
            <p className="card muted" role="status">
              {t.empty}
            </p>
          ) : null}
          <section className="stat-grid" aria-label={t.title}>
            <StatCard label={t.cards.totalUsers} value={value(data?.users.total)} />
            <StatCard label={t.cards.newUsers} value={value(data?.users.new)} hint={hint} />
            <StatCard label={t.cards.activeUsers} value={value(data?.users.active)} hint={hint} />
            <StatCard label={t.cards.admins} value={value(data?.users.admins)} />
            <StatCard label={t.cards.suspended} value={value(data?.users.suspended)} />
            <StatCard
              label={t.cards.languages}
              value={value(data ? data.languages.en + data.languages.so : undefined)}
              hint={data ? t.languageSplit(data.languages.en, data.languages.so) : undefined}
            />
          </section>
        </>
      )}

      <h2 className="section-title">{t.soonTitle}</h2>
      <section className="stat-grid" aria-label={t.soonTitle}>
        {SOON_KEYS.map((key) => (
          <SoonCard key={key} label={t.soon[key].label} note={t.soon[key].note} />
        ))}
      </section>
    </>
  );
}
