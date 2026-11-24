import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { StatCard } from '../components/ui/StatCard';
import { useLoad } from '../hooks/useLoad';
import {
  INTERVIEWS_PAGE_SIZE,
  INTERVIEW_STATUS_BADGE,
  INTERVIEW_LANGUAGES,
  INTERVIEW_STATUSES,
  INTERVIEW_TYPES,
  fetchInterviews,
  filtersFromParams,
  filtersToParams,
  jobLabel,
  type InterviewFilters,
} from '../services/interviewsApi';
import { PERIODS } from '../types/overview';
import { formatDate } from '../utils/format';

/**
 * Admin → Interviews: every interview practice session, read-only. Who, the
 * type, the job, language, how far they got and the scores; never the user's
 * answers. Status, type, language, period and page live in the address.
 */
export function InterviewsPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const { status, type, language, period, page } = filters;

  const { state, reload } = useLoad(
    `interviews:${status}:${type}:${language}:${period}:${page}`,
    () => fetchInterviews(request, filters),
  );
  const data = state.status === 'ready' ? state.data : null;
  const value = (n: number | undefined) => (state.status === 'loading' ? null : (n ?? 0));
  const from = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0;
  const to = data ? Math.min(data.page * data.limit, data.total) : 0;
  const average = data?.summary.averageScore;

  function go(next: Partial<InterviewFilters>) {
    setParams(filtersToParams({ ...filters, page: 1, ...next }), { replace: true });
  }

  return (
    <>
      <header className="page-header">
        <h1>{t('admin.interviews.title')}</h1>
        <p className="muted">{t('admin.interviews.subtitle')}</p>
      </header>

      <section className="stat-grid" aria-label={t('admin.interviews.title')}>
        <StatCard
          label={t('admin.interviews.cards.finished')}
          value={value(data?.summary.finished)}
        />
        <StatCard
          label={t('admin.interviews.cards.inProgress')}
          value={value(data?.summary.inProgress)}
        />
        <StatCard
          label={t('admin.interviews.cards.cancelled')}
          value={value(data?.summary.cancelled)}
        />
        <StatCard
          label={t('admin.interviews.cards.averageScore')}
          value={
            state.status === 'loading'
              ? null
              : typeof average === 'number'
                ? t('admin.interviews.scoreValue', { score: average })
                : t('admin.interviews.detail.none')
          }
        />
      </section>

      <div className="toolbar">
        <label className="select-field">
          <span>{t('admin.interviews.statusFilter')}</span>
          <select
            value={status}
            onChange={(e) => go({ status: e.target.value as InterviewFilters['status'] })}
          >
            <option value="">{t('admin.interviews.all')}</option>
            {INTERVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.interviews.statuses.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>{t('admin.interviews.typeFilter')}</span>
          <select
            value={type}
            onChange={(e) => go({ type: e.target.value as InterviewFilters['type'] })}
          >
            <option value="">{t('admin.interviews.all')}</option>
            {INTERVIEW_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`admin.interviews.types.${ty}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>{t('admin.interviews.languageFilter')}</span>
          <select
            value={language}
            onChange={(e) => go({ language: e.target.value as InterviewFilters['language'] })}
          >
            <option value="">{t('admin.interviews.all')}</option>
            {INTERVIEW_LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {t(`common.language.${l}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>{t('admin.interviews.periodFilter')}</span>
          <select
            value={period}
            onChange={(e) => go({ period: e.target.value as InterviewFilters['period'] })}
          >
            <option value="">{t('admin.reports.periods.all')}</option>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`admin.reports.periods.${p}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.status === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.interviews.error')}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t('admin.interviews.retry')}
          </button>
        </div>
      ) : (
        <div className="table-card" aria-busy={state.status === 'loading'}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('admin.interviews.columns.started')}</th>
                <th scope="col">{t('admin.interviews.columns.user')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.interviews.columns.type')}
                </th>
                <th scope="col">{t('admin.interviews.columns.job')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.interviews.columns.language')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.interviews.columns.status')}
                </th>
                <th scope="col">{t('admin.interviews.columns.score')}</th>
                <th scope="col">{t('admin.interviews.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    {t('admin.interviews.empty')}
                  </td>
                </tr>
              ) : null}
              {(data?.items ?? []).map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.createdAt, i18n.language, true)}</td>
                  <td className="cell-wrap">
                    {row.email ? (
                      <Link to={`/users/${row.userId}`} className="table-link">
                        {row.email}
                      </Link>
                    ) : (
                      <span className="muted">{t('admin.interviews.deletedUser')}</span>
                    )}
                  </td>
                  <td className="col-optional">{t(`admin.interviews.types.${row.type}`)}</td>
                  <td className="cell-wrap" lang={row.language}>
                    {jobLabel(row)}
                  </td>
                  <td className="col-optional">{t(`common.language.${row.language}`)}</td>
                  <td className="col-optional">
                    <span className={`badge ${INTERVIEW_STATUS_BADGE[row.status]}`}>
                      {t(`admin.interviews.statuses.${row.status}`)}
                    </span>
                  </td>
                  <td>
                    {row.averageScore !== null
                      ? `${t('admin.interviews.scoreValue', { score: row.averageScore })} · `
                      : null}
                    <span className="muted">
                      {t('admin.interviews.answeredOf', {
                        answered: row.answered,
                        length: row.length,
                      })}
                    </span>
                  </td>
                  <td>
                    <Link to={`/interviews/${row.id}`} className="table-link">
                      {t('admin.interviews.details')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > INTERVIEWS_PAGE_SIZE ? (
        <nav className="pager" aria-label={t('admin.interviews.title')}>
          <span className="muted">{t('admin.users.range', { from, to, total: data.total })}</span>
          <button
            type="button"
            className="button-secondary"
            disabled={data.page <= 1}
            onClick={() => go({ page: data.page - 1 })}
          >
            {t('admin.users.previous')}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={to >= data.total}
            onClick={() => go({ page: data.page + 1 })}
          >
            {t('admin.users.next')}
          </button>
        </nav>
      ) : null}
    </>
  );
}
