import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useLoad } from '../hooks/useLoad';
import { ApiError } from '../services/api';
import { fetchJobSources } from '../services/jobSourcesApi';
import { fetchRun, retryRun } from '../services/researchApi';
import { canRetry, type RunStatus } from '../types/research';
import { formatDate } from '../utils/format';

const STATUS_BADGE: Record<RunStatus, string> = {
  running: 'badge-user',
  completed: 'badge-active',
  partial: 'badge-test',
  failed: 'badge-suspended',
};

/** Admin → one job search: what was asked, every source's result and error, retries. */
export function ResearchRunDetailPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const navigate = useNavigate();
  const id = useParams().id ?? '';
  const { state, reload } = useLoad(`run:${id}`, () => fetchRun(request, id));
  const sources = useLoad('job-sources', () => fetchJobSources(request));
  const sourceName = (key: string) =>
    (sources.state.status === 'ready'
      ? sources.state.data.sources.find((s) => s.key === key)?.name
      : undefined) ?? key;

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const next = await retryRun(request, id);
      setConfirming(false);
      void navigate(`/research-runs/${next.id}`);
    } catch (err) {
      setConfirming(false);
      setError(err instanceof ApiError ? err.message : t('admin.errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  const none = t('admin.runs.detail.none');
  const list = (items: string[]) => (items.length > 0 ? items.join(', ') : none);
  const notFound = state.status === 'error';
  const run = state.status === 'ready' ? state.data : null;

  return (
    <>
      <p>
        <Link to="/research-runs" className="table-link">
          {t('admin.runs.back')}
        </Link>
      </p>

      {notFound ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.runs.detail.notFound')}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t('admin.runs.retryLoad')}
          </button>
        </div>
      ) : null}

      {run ? (
        <>
          <header className="page-header page-header-row">
            <div className="page-title">
              <h1>{t('admin.runs.detail.title')}</h1>
              <p>
                <span className={`badge ${STATUS_BADGE[run.status]}`}>
                  {t(`admin.runs.statuses.${run.status}`)}
                </span>{' '}
                <span className="muted">{t(`admin.runs.triggers.${run.trigger}`)}</span>
              </p>
            </div>
            {canRetry(run.status) ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => setConfirming(true)}
              >
                {t('admin.runs.retry')}
              </button>
            ) : null}
          </header>

          {error ? (
            <p className="alert" role="alert">
              {error}
            </p>
          ) : null}

          <section className="card">
            <dl className="details">
              <dt>{t('admin.runs.columns.user')}</dt>
              <dd className="break-anywhere">
                {run.email ? (
                  <Link to={`/users/${run.userId}`} className="table-link">
                    {run.email}
                  </Link>
                ) : (
                  t('admin.runs.deletedUser')
                )}
              </dd>
              <dt>{t('admin.runs.columns.started')}</dt>
              <dd>{formatDate(run.startedAt, i18n.language, true)}</dd>
              <dt>{t('admin.runs.detail.finished')}</dt>
              <dd>
                {run.finishedAt
                  ? formatDate(run.finishedAt, i18n.language, true)
                  : t('admin.runs.detail.notFinished')}
              </dd>
              <dt>{t('admin.runs.columns.jobs')}</dt>
              <dd>{t('admin.runs.jobsCount', { found: run.jobsFound, new: run.jobsNew })}</dd>
              <dt>{t('admin.runs.detail.regions')}</dt>
              <dd>{list(run.regions.map((r) => t(`common.region.${r}`)))}</dd>
              <dt>{t('admin.runs.detail.titles')}</dt>
              <dd>{list(run.filters.titles)}</dd>
              <dt>{t('admin.runs.detail.skills')}</dt>
              <dd>{list(run.filters.skills)}</dd>
              <dt>{t('admin.runs.detail.city')}</dt>
              <dd>{run.filters.city || none}</dd>
              <dt>{t('admin.runs.detail.employerTypes')}</dt>
              <dd>{list(run.filters.employerTypes.map((e) => t(`common.employerType.${e}`)))}</dd>
              <dt>{t('admin.runs.detail.links')}</dt>
              <dd className="break-anywhere">{list(run.customUrls)}</dd>
              {run.retryOf ? (
                <>
                  <dt>{t('admin.runs.detail.retryOf')}</dt>
                  <dd>
                    <Link to={`/research-runs/${run.retryOf}`} className="table-link">
                      {t('admin.runs.details')}
                    </Link>
                  </dd>
                </>
              ) : null}
              {run.error ? (
                <>
                  <dt>{t('admin.runs.detail.error')}</dt>
                  <dd>{run.error}</dd>
                </>
              ) : null}
            </dl>
          </section>

          <h2 className="section-title">{t('admin.runs.detail.perSource')}</h2>
          <div className="table-card">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t('admin.runs.sourceColumns.source')}</th>
                  <th scope="col" className="col-optional">
                    {t('admin.runs.sourceColumns.searched')}
                  </th>
                  <th scope="col">{t('admin.runs.sourceColumns.found')}</th>
                  <th scope="col" className="col-optional">
                    {t('admin.runs.sourceColumns.new')}
                  </th>
                  <th scope="col" className="col-optional">
                    {t('admin.runs.sourceColumns.duplicates')}
                  </th>
                  <th scope="col" className="col-optional">
                    {t('admin.runs.sourceColumns.invalid')}
                  </th>
                  <th scope="col" className="col-optional">
                    {t('admin.runs.sourceColumns.attempts')}
                  </th>
                  <th scope="col">{t('admin.runs.sourceColumns.error')}</th>
                </tr>
              </thead>
              <tbody>
                {run.perSource.map((p) => (
                  <tr key={p.key}>
                    <td className="cell-wrap">{sourceName(p.key)}</td>
                    <td className="col-optional">
                      {p.queried ? t('admin.runs.yes') : t('admin.runs.no')}
                    </td>
                    <td>{p.found}</td>
                    <td className="col-optional">{p.new}</td>
                    <td className="col-optional">{p.duplicates}</td>
                    <td className="col-optional">{p.invalid}</td>
                    <td className="col-optional">{p.attempts}</td>
                    <td className="cell-wrap">{p.error ?? none}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="section-title">{t('admin.runs.detail.retries')}</h2>
          {run.retries.length === 0 ? (
            <p className="muted">{t('admin.runs.detail.noRetries')}</p>
          ) : (
            <ul>
              {run.retries.map((r) => (
                <li key={r.id}>
                  <Link to={`/research-runs/${r.id}`} className="table-link">
                    {formatDate(r.startedAt, i18n.language, true)}
                  </Link>{' '}
                  <span className={`badge ${STATUS_BADGE[r.status]}`}>
                    {t(`admin.runs.statuses.${r.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <ConfirmDialog
            open={confirming}
            message={t('admin.runs.confirmRetry', {
              email: run.email ?? t('admin.runs.deletedUser'),
            })}
            confirmLabel={t('admin.runs.confirmYes')}
            cancelLabel={t('admin.runs.cancel')}
            busy={busy}
            onConfirm={() => void retry()}
            onCancel={() => setConfirming(false)}
          />
        </>
      ) : null}
    </>
  );
}
