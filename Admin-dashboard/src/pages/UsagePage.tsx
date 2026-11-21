import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { PeriodSwitch } from '../components/ui/PeriodSwitch';
import { StatCard } from '../components/ui/StatCard';
import { useLoad } from '../hooks/useLoad';
import { fetchUsage, formatCompact, totalTokens } from '../services/usageApi';
import { PERIODS, isPeriod, type Period } from '../types/overview';
import { formatDate } from '../utils/format';

/** Admin → AI usage (TIQ-23): who uses the AI features and how much. Read-only, never a limit. */
export function UsagePage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  // The period lives in the address (?period=month), like the Overview.
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('period');
  const period: Period = isPeriod(fromUrl) ? fromUrl : 'week';
  const setPeriod = (next: Period) =>
    setParams(next === 'week' ? {} : { period: next }, { replace: true });

  const { state, reload } = useLoad(`usage:${period}`, () => fetchUsage(request, period));
  const data = state.status === 'ready' ? state.data : null;
  const value = (n: number | undefined) => (state.status === 'loading' ? null : (n ?? 0));
  const num = (n: number) => new Intl.NumberFormat(i18n.language).format(n);
  const hint = t(`admin.overview.periodHint.${period}`);
  const periodLabels = Object.fromEntries(
    PERIODS.map((p) => [p, t(`admin.overview.periods.${p}`)]),
  ) as Record<Period, string>;

  return (
    <>
      <header className="page-header page-header-row">
        <div className="page-title">
          <h1>{t('admin.usage.title')}</h1>
          <p className="muted">
            {t('admin.usage.subtitle')}
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
          <span>{t('admin.usage.error')}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t('admin.usage.retry')}
          </button>
        </div>
      ) : (
        <>
          <section className="stat-grid" aria-label={t('admin.usage.title')}>
            <StatCard
              label={t('admin.usage.cards.requests')}
              value={value(data?.totals.requests)}
              hint={hint}
            />
            <StatCard
              label={t('admin.usage.cards.users')}
              value={value(data?.totals.users)}
              hint={hint}
            />
            <StatCard
              label={t('admin.usage.cards.tokens')}
              value={value(data ? totalTokens(data.totals) : undefined)}
              hint={
                data
                  ? t('admin.usage.tokensSplit', {
                      input: num(data.totals.inputTokens),
                      output: num(data.totals.outputTokens),
                    })
                  : undefined
              }
            />
            <StatCard
              label={t('admin.usage.cards.failed')}
              value={value(data?.totals.failed)}
              hint={t('admin.usage.failedHint')}
            />
            <StatCard
              label={t('admin.usage.cards.capped')}
              value={value(data?.totals.capped)}
              hint={data ? t('admin.usage.capHint', { count: data.hourlyCap }) : undefined}
            />
          </section>

          {data && data.totals.requests === 0 ? (
            <p className="card muted" role="status">
              {t('admin.usage.empty')}
            </p>
          ) : null}

          {data && data.totals.requests > 0 ? (
            <>
              <h2 className="section-title">{t('admin.usage.featuresTitle')}</h2>
              <div className="table-card">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{t('admin.usage.columns.feature')}</th>
                      <th scope="col">{t('admin.usage.columns.requests')}</th>
                      <th scope="col" className="col-optional">
                        {t('admin.usage.columns.ok')}
                      </th>
                      <th scope="col">{t('admin.usage.columns.failed')}</th>
                      <th scope="col" className="col-optional">
                        {t('admin.usage.columns.capped')}
                      </th>
                      <th scope="col">{t('admin.usage.columns.tokens')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.features.map((f) => (
                      <tr key={f.feature} className={f.requests === 0 ? 'muted' : undefined}>
                        <td>{t(`admin.usage.features.${f.feature}`)}</td>
                        <td>{num(f.requests)}</td>
                        <td className="col-optional">{num(f.ok)}</td>
                        <td>{num(f.failed)}</td>
                        <td className="col-optional">{num(f.capped)}</td>
                        <td title={num(totalTokens(f))}>
                          {formatCompact(totalTokens(f), i18n.language)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h2 className="section-title">{t('admin.usage.usersTitle')}</h2>
              <p className="muted">{t('admin.usage.usersNote')}</p>
              <div className="table-card">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{t('admin.usage.columns.user')}</th>
                      <th scope="col">{t('admin.usage.columns.requests')}</th>
                      <th scope="col" className="col-optional">
                        {t('admin.usage.columns.failed')}
                      </th>
                      <th scope="col">{t('admin.usage.columns.capped')}</th>
                      <th scope="col" className="col-optional">
                        {t('admin.usage.columns.tokens')}
                      </th>
                      <th scope="col" className="col-optional">
                        {t('admin.usage.columns.last')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.userId}>
                        <td className="cell-wrap">
                          {u.email ? (
                            <Link to={`/users/${u.userId}`} className="table-link">
                              {u.email}
                            </Link>
                          ) : (
                            <span className="muted">{t('admin.usage.deletedUser')}</span>
                          )}
                        </td>
                        <td>{num(u.requests)}</td>
                        <td className="col-optional">{num(u.failed)}</td>
                        <td>{num(u.capped)}</td>
                        <td className="col-optional" title={num(totalTokens(u))}>
                          {formatCompact(totalTokens(u), i18n.language)}
                        </td>
                        <td className="col-optional">
                          {formatDate(u.lastAt, i18n.language, true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
