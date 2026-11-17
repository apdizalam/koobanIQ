import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { PeriodSwitch } from '../components/ui/PeriodSwitch';
import { SoonCard, StatCard } from '../components/ui/StatCard';
import { useOverview } from '../hooks/useOverview';
import { PERIODS, isPeriod, type Period } from '../types/overview';

const SOON_KEYS = ['assessments', 'cvs', 'runs', 'failedJobs', 'aiUsage'] as const;

/** Admin Overview: live user numbers + cards for features that are not built yet. */
export function OverviewPage() {
  const { t, i18n } = useTranslation();
  // The period lives in the address (?period=month), so a reload or a shared link keeps it.
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('period');
  const period: Period = isPeriod(fromUrl) ? fromUrl : 'week';
  const setPeriod = (next: Period) =>
    setParams(next === 'week' ? {} : { period: next }, { replace: true });

  const { state, reload } = useOverview(period);
  const data = state.status === 'ready' ? state.data : null;
  const value = (n: number | undefined) => (state.status === 'loading' ? null : (n ?? 0));
  const hint = t(`admin.overview.periodHint.${period}`);
  const periodLabels = Object.fromEntries(
    PERIODS.map((p) => [p, t(`admin.overview.periods.${p}`)]),
  ) as Record<Period, string>;

  return (
    <>
      <header className="page-header page-header-row">
        <div className="page-title">
          <h1>{t('admin.overview.title')}</h1>
          <p className="muted">
            {t('admin.overview.subtitle')}
            {data
              ? ` ${t('admin.overview.updatedAt', {
                  time: new Date(data.generatedAt).toLocaleTimeString(i18n.language),
                })}`
              : null}
          </p>
        </div>
        <PeriodSwitch
          value={period}
          onChange={setPeriod}
          labels={periodLabels}
          label={t('admin.overview.periodLabel')}
        />
      </header>

      {state.status === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.overview.error')}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t('admin.overview.retry')}
          </button>
        </div>
      ) : (
        <>
          {data && data.users.total === 0 ? (
            <p className="card muted" role="status">
              {t('admin.overview.empty')}
            </p>
          ) : null}
          <section className="stat-grid" aria-label={t('admin.overview.title')}>
            <StatCard
              label={t('admin.overview.cards.totalUsers')}
              value={value(data?.users.total)}
            />
            <StatCard
              label={t('admin.overview.cards.newUsers')}
              value={value(data?.users.new)}
              hint={hint}
            />
            <StatCard
              label={t('admin.overview.cards.activeUsers')}
              value={value(data?.users.active)}
              hint={hint}
            />
            <StatCard label={t('admin.overview.cards.admins')} value={value(data?.users.admins)} />
            <StatCard
              label={t('admin.overview.cards.suspended')}
              value={value(data?.users.suspended)}
            />
            <StatCard
              label={t('admin.overview.cards.languages')}
              value={value(data ? data.languages.en + data.languages.so : undefined)}
              hint={
                data
                  ? t('admin.overview.languageSplit', {
                      en: data.languages.en,
                      so: data.languages.so,
                    })
                  : undefined
              }
            />
          </section>
        </>
      )}

      <h2 className="section-title">{t('admin.overview.soonTitle')}</h2>
      <section className="stat-grid" aria-label={t('admin.overview.soonTitle')}>
        {SOON_KEYS.map((key) => (
          <SoonCard
            key={key}
            label={t(`admin.overview.soon.${key}.label`)}
            note={t(`admin.overview.soon.${key}.note`)}
          />
        ))}
      </section>
    </>
  );
}
