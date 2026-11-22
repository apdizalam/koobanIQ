import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { StatCard } from '../components/ui/StatCard';
import { useLoad } from '../hooks/useLoad';
import { ApiError } from '../services/api';
import { fetchJobSources } from '../services/jobSourcesApi';
import {
  JOBS_PAGE_SIZE,
  JOB_STATES,
  fetchJobs,
  isJobState,
  placeLabel,
  removeExpiredJobs,
  type JobState,
} from '../services/jobsApi';
import { formatDate } from '../utils/format';

const STATE_BADGE: Record<JobState, string> = {
  active: 'badge-active',
  expired: 'badge-test',
  removed: 'badge-suspended',
};

/**
 * Admin → Jobs & matching (TIQ-33): every stored job by source and state, with
 * how many users it matched and saved it; remove all expired jobs at once.
 * State, source, text search and page live in the address.
 */
export function JobsPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('state');
  const state: '' | JobState = isJobState(fromUrl) ? fromUrl : '';
  const source = params.get('source') ?? '';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [qInput, setQInput] = useState(q);

  const jobs = useLoad(`jobs:${state}:${source}:${q}:${page}`, () =>
    fetchJobs(request, { state, source, q, page }),
  );
  const sources = useLoad('job-sources', () => fetchJobSources(request));
  const sourceName = (key: string) =>
    (sources.state.status === 'ready'
      ? sources.state.data.sources.find((s) => s.key === key)?.name
      : undefined) ?? key;

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'notice' | 'alert'; text: string } | null>(null);

  const data = jobs.state.status === 'ready' ? jobs.state.data : null;
  const value = (n: number | undefined) => (jobs.state.status === 'loading' ? null : (n ?? 0));
  const from = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0;
  const to = data ? Math.min(data.page * data.limit, data.total) : 0;

  function go(next: { state?: '' | JobState; source?: string; q?: string; page?: number }) {
    const merged = { state, source, q, page: 1, ...next };
    const out: Record<string, string> = {};
    if (merged.state) out.state = merged.state;
    if (merged.source) out.source = merged.source;
    if (merged.q.trim()) out.q = merged.q.trim();
    if (merged.page > 1) out.page = String(merged.page);
    setParams(out, { replace: true });
  }

  function search(e: FormEvent) {
    e.preventDefault();
    go({ q: qInput });
  }

  async function removeExpired() {
    setBusy(true);
    try {
      const count = await removeExpiredJobs(request);
      setMessage({ kind: 'notice', text: t('admin.jobs.doneExpired', { count }) });
      jobs.reload();
    } catch (err) {
      setMessage({
        kind: 'alert',
        text: err instanceof ApiError ? err.message : t('admin.errors.generic'),
      });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <header className="page-header page-header-row">
        <div className="page-title">
          <h1>{t('admin.jobs.title')}</h1>
          <p className="muted">{t('admin.jobs.subtitle')}</p>
        </div>
        <button
          type="button"
          className="button-secondary"
          disabled={!data || data.summary.expired === 0 || busy}
          onClick={() => setConfirming(true)}
        >
          {t('admin.jobs.removeExpired')}
        </button>
      </header>

      {message ? (
        <p className={message.kind} role={message.kind === 'alert' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}

      <section className="stat-grid" aria-label={t('admin.jobs.title')}>
        {JOB_STATES.map((s) => (
          <StatCard key={s} label={t(`admin.jobs.cards.${s}`)} value={value(data?.summary[s])} />
        ))}
      </section>

      {data && data.summary.bySource.length > 0 ? (
        <p className="muted">
          {t('admin.jobs.bySource')}:{' '}
          {data.summary.bySource.map((s) => `${sourceName(s.sourceKey)} ${s.active}`).join(' · ')}
        </p>
      ) : null}

      <div className="toolbar">
        <label className="select-field">
          <span>{t('admin.jobs.stateFilter')}</span>
          <select value={state} onChange={(e) => go({ state: e.target.value as '' | JobState })}>
            <option value="">{t('admin.jobs.all')}</option>
            {JOB_STATES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.jobs.states.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>{t('admin.jobs.sourceFilter')}</span>
          <select value={source} onChange={(e) => go({ source: e.target.value })}>
            <option value="">{t('admin.jobs.all')}</option>
            {(sources.state.status === 'ready' ? sources.state.data.sources : []).map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <form className="search-form" onSubmit={search} role="search">
          <label className="select-field">
            <span>{t('admin.jobs.search')}</span>
            <input
              className="input"
              value={qInput}
              maxLength={80}
              onChange={(e) => setQInput(e.target.value)}
            />
          </label>
          <button type="submit" className="button-secondary">
            {t('admin.jobs.searchButton')}
          </button>
        </form>
      </div>

      {jobs.state.status === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.jobs.error')}</span>
          <button type="button" className="button-secondary" onClick={jobs.reload}>
            {t('admin.jobs.retry')}
          </button>
        </div>
      ) : (
        <div className="table-card" aria-busy={jobs.state.status === 'loading'}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('admin.jobs.columns.job')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.jobs.columns.source')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.jobs.columns.place')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.jobs.columns.deadline')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.jobs.columns.seen')}
                </th>
                <th scope="col">{t('admin.jobs.columns.state')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.jobs.columns.matches')}
                </th>
                <th scope="col">{t('admin.jobs.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    {t('admin.jobs.empty')}
                  </td>
                </tr>
              ) : null}
              {(data?.items ?? []).map((j) => (
                <tr key={j.id}>
                  <td className="cell-wrap">
                    {j.title}
                    <span className="cell-note muted">{j.employer}</span>
                  </td>
                  <td className="col-optional cell-wrap">
                    {j.sourceKeys.map(sourceName).join(', ')}
                  </td>
                  <td className="col-optional cell-wrap">
                    {placeLabel(j.city, t(`common.region.${j.region}`))}
                  </td>
                  <td className="col-optional">
                    {j.deadline
                      ? formatDate(j.deadline, i18n.language)
                      : t('admin.jobs.noDeadline')}
                  </td>
                  <td className="col-optional">{formatDate(j.firstSeenAt, i18n.language)}</td>
                  <td>
                    <span className={`badge ${STATE_BADGE[j.state]}`}>
                      {t(`admin.jobs.states.${j.state}`)}
                    </span>
                    {j.removedReason ? (
                      <span className="cell-note muted">
                        {t(`admin.jobs.reasons.${j.removedReason}`)}
                      </span>
                    ) : null}
                  </td>
                  <td className="col-optional">
                    {t('admin.jobs.matchesValue', {
                      count: j.matches,
                      strong: j.strongMatches,
                      saved: j.saved,
                    })}
                  </td>
                  <td>
                    <Link to={`/jobs/${j.id}`} className="table-link">
                      {t('admin.jobs.details')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > JOBS_PAGE_SIZE ? (
        <nav className="pager" aria-label={t('admin.jobs.title')}>
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

      <ConfirmDialog
        open={confirming}
        message={t('admin.jobs.confirmExpired', { count: data?.summary.expired ?? 0 })}
        confirmLabel={t('admin.jobs.confirmYes')}
        cancelLabel={t('admin.jobs.cancel')}
        danger
        busy={busy}
        onConfirm={() => void removeExpired()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
