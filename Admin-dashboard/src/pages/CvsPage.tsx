import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { StatCard } from '../components/ui/StatCard';
import { useLoad } from '../hooks/useLoad';
import {
  CVS_PAGE_SIZE,
  CV_STATUSES,
  fetchCvs,
  isCvStatus,
  jobLabel,
  type CvStatus,
} from '../services/cvsApi';
import { formatDate } from '../utils/format';

const STATUS_BADGE: Record<CvStatus, string> = {
  draft: 'badge-user',
  approved: 'badge-test',
  exported: 'badge-active',
};

/**
 * Admin → CVs (TIQ-33): read-only status of every generated CV (who, which job
 * ad, language, version, draft / approved / downloaded, missing info). The CV
 * text is the user's and never shown. Status filter and page live in the address.
 */
export function CvsPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('status');
  const status: '' | CvStatus = isCvStatus(fromUrl) ? fromUrl : '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const { state, reload } = useLoad(`cvs:${status}:${page}`, () =>
    fetchCvs(request, { status, page }),
  );
  const data = state.status === 'ready' ? state.data : null;
  const value = (n: number | undefined) => (state.status === 'loading' ? null : (n ?? 0));
  const from = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0;
  const to = data ? Math.min(data.page * data.limit, data.total) : 0;
  const none = t('admin.cvs.none');
  const date = (iso: string | null) => (iso ? formatDate(iso, i18n.language) : none);

  function go(next: { status?: '' | CvStatus; page?: number }) {
    const merged = { status, page: 1, ...next };
    const out: Record<string, string> = {};
    if (merged.status) out.status = merged.status;
    if (merged.page > 1) out.page = String(merged.page);
    setParams(out, { replace: true });
  }

  return (
    <>
      <header className="page-header">
        <h1>{t('admin.cvs.title')}</h1>
        <p className="muted">{t('admin.cvs.subtitle')}</p>
      </header>

      <section className="stat-grid" aria-label={t('admin.cvs.title')}>
        {CV_STATUSES.map((s) => (
          <StatCard key={s} label={t(`admin.cvs.cards.${s}`)} value={value(data?.summary[s])} />
        ))}
      </section>

      <div className="toolbar">
        <label className="select-field">
          <span>{t('admin.cvs.statusFilter')}</span>
          <select value={status} onChange={(e) => go({ status: e.target.value as '' | CvStatus })}>
            <option value="">{t('admin.cvs.all')}</option>
            {CV_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.cvs.statuses.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.status === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.cvs.error')}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t('admin.cvs.retry')}
          </button>
        </div>
      ) : (
        <div className="table-card" aria-busy={state.status === 'loading'}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('admin.cvs.columns.created')}</th>
                <th scope="col">{t('admin.cvs.columns.user')}</th>
                <th scope="col">{t('admin.cvs.columns.job')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.cvs.columns.language')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.cvs.columns.version')}
                </th>
                <th scope="col">{t('admin.cvs.columns.status')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.cvs.columns.missing')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.cvs.columns.dates')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    {t('admin.cvs.empty')}
                  </td>
                </tr>
              ) : null}
              {(data?.items ?? []).map((cv) => (
                <tr key={cv.id}>
                  <td>{formatDate(cv.createdAt, i18n.language, true)}</td>
                  <td className="cell-wrap">
                    {cv.email ? (
                      <Link to={`/users/${cv.userId}`} className="table-link">
                        {cv.email}
                      </Link>
                    ) : (
                      <span className="muted">{t('admin.cvs.deletedUser')}</span>
                    )}
                  </td>
                  <td className="cell-wrap">
                    {jobLabel(cv) ?? <span className="muted">{t('admin.cvs.unknownJob')}</span>}
                  </td>
                  <td className="col-optional">{t(`common.language.${cv.language}`)}</td>
                  <td className="col-optional">
                    {t('admin.cvs.version', { version: cv.version })}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[cv.status]}`}>
                      {t(`admin.cvs.statuses.${cv.status}`)}
                    </span>
                  </td>
                  <td className="col-optional">
                    {cv.missingInfo > 0 ? t('admin.cvs.missing', { count: cv.missingInfo }) : none}
                  </td>
                  <td className="col-optional">
                    {date(cv.approvedAt)} / {date(cv.exportedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > CVS_PAGE_SIZE ? (
        <nav className="pager" aria-label={t('admin.cvs.title')}>
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
