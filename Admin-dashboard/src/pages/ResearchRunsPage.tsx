import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useLoad } from '../hooks/useLoad';
import { ApiError } from '../services/api';
import { fetchJobSources } from '../services/jobSourcesApi';
import {
  RUNS_PAGE_SIZE,
  fetchRuns,
  fetchSchedules,
  retryRun,
  runProblem,
  setScheduleEnabled,
} from '../services/researchApi';
import {
  RUN_STATUSES,
  canRetry,
  isRunStatus,
  type AdminRunRow,
  type AdminSchedule,
  type RunStatus,
} from '../types/research';
import { formatDate } from '../utils/format';

const STATUS_BADGE: Record<RunStatus, string> = {
  running: 'badge-user',
  completed: 'badge-active',
  partial: 'badge-test',
  failed: 'badge-suspended',
};

type Pending =
  | { kind: 'retry'; run: AdminRunRow }
  | { kind: 'pause' | 'resume'; schedule: AdminSchedule }
  | null;

/**
 * Admin → Research runs (TIQ-33): every job search with its result and errors
 * (retry a failed one), and every scheduled search (pause / resume). Tab, filter
 * and page live in the address.
 */
export function ResearchRunsPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'schedules' ? 'schedules' : 'runs';
  const fromUrl = params.get('status');
  const status: '' | RunStatus = isRunStatus(fromUrl) ? fromUrl : '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const runs = useLoad(`runs:${tab}:${status}:${page}`, () =>
    tab === 'runs' ? fetchRuns(request, { status, page }) : Promise.resolve(null),
  );
  const schedules = useLoad(`schedules:${tab}:${page}`, () =>
    tab === 'schedules' ? fetchSchedules(request, page) : Promise.resolve(null),
  );
  const sources = useLoad('job-sources', () => fetchJobSources(request));
  const sourceName = (key: string) =>
    (sources.state.status === 'ready'
      ? sources.state.data.sources.find((s) => s.key === key)?.name
      : undefined) ?? key;

  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    kind: 'notice' | 'alert';
    text: string;
    runId?: string;
  } | null>(null);

  function go(next: { tab?: 'runs' | 'schedules'; status?: '' | RunStatus; page?: number }) {
    const merged = { tab, status, page: 1, ...next };
    const out: Record<string, string> = {};
    if (merged.tab === 'schedules') out.tab = 'schedules';
    else if (merged.status) out.status = merged.status;
    if (merged.page > 1) out.page = String(merged.page);
    setMessage(null);
    setParams(out, { replace: true });
  }

  const failText = (err: unknown) =>
    err instanceof ApiError ? err.message : t('admin.errors.generic');

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'retry') {
        const run = await retryRun(request, pending.run.id);
        setMessage({ kind: 'notice', text: t('admin.runs.retried'), runId: run.id });
        runs.reload();
      } else {
        await setScheduleEnabled(request, pending.schedule.id, pending.kind === 'resume');
        setMessage({
          kind: 'notice',
          text: t(
            pending.kind === 'pause'
              ? 'admin.runs.schedules.donePause'
              : 'admin.runs.schedules.doneResume',
          ),
        });
        schedules.reload();
      }
    } catch (err) {
      setMessage({ kind: 'alert', text: failText(err) });
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const who = (row: { userId: string; email: string | null }) =>
    row.email ? (
      <Link to={`/users/${row.userId}`} className="table-link">
        {row.email}
      </Link>
    ) : (
      <span className="muted">{t('admin.runs.deletedUser')}</span>
    );

  function problem(run: AdminRunRow) {
    const p = runProblem(run);
    if (!p) return <span className="muted">{t('admin.runs.noProblems')}</span>;
    if (p.kind === 'error') return p.text;
    return t('admin.runs.failedSources', { sources: p.keys.map(sourceName).join(', ') });
  }

  function when(s: AdminSchedule) {
    const text =
      s.frequency === 'hourly'
        ? t('admin.runs.schedules.frequency.hourly', { minute: s.time.slice(3) })
        : s.frequency === 'weekly'
          ? t('admin.runs.schedules.frequency.weekly', {
              weekday: t(`admin.runs.schedules.weekdays.${String(s.weekday ?? 0) as '0'}`),
              time: s.time,
            })
          : t(`admin.runs.schedules.frequency.${s.frequency}`, { time: s.time });
    return (
      <>
        {text}
        <span className="cell-note muted">{s.timeZone}</span>
      </>
    );
  }

  const loading = tab === 'runs' ? runs.state.status : schedules.state.status;
  const pageData =
    tab === 'runs'
      ? runs.state.status === 'ready'
        ? runs.state.data
        : null
      : schedules.state.status === 'ready'
        ? schedules.state.data
        : null;
  const from = pageData && pageData.total > 0 ? (pageData.page - 1) * pageData.limit + 1 : 0;
  const to = pageData ? Math.min(pageData.page * pageData.limit, pageData.total) : 0;

  return (
    <>
      <header className="page-header">
        <h1>{t('admin.runs.title')}</h1>
        <p className="muted">
          {tab === 'runs' ? t('admin.runs.subtitle') : t('admin.runs.schedules.subtitle')}
        </p>
      </header>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label={t('admin.runs.title')}>
          {(['runs', 'schedules'] as const).map((key) => (
            <button
              key={key}
              type="button"
              className={`segment${tab === key ? ' segment-active' : ''}`}
              aria-pressed={tab === key}
              onClick={() => go({ tab: key })}
            >
              {t(`admin.runs.tabs.${key}`)}
            </button>
          ))}
        </div>
        {tab === 'runs' ? (
          <label className="select-field">
            <span>{t('admin.runs.statusFilter')}</span>
            <select
              value={status}
              onChange={(e) => go({ status: e.target.value as '' | RunStatus })}
            >
              <option value="">{t('admin.runs.all')}</option>
              {RUN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`admin.runs.statuses.${s}`)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {message ? (
        <p className={message.kind} role={message.kind === 'alert' ? 'alert' : 'status'}>
          {message.text}{' '}
          {message.runId ? (
            <Link to={`/research-runs/${message.runId}`} className="table-link">
              {t('admin.runs.openNewRun')}
            </Link>
          ) : null}
        </p>
      ) : null}

      {loading === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.runs.error')}</span>
          <button
            type="button"
            className="button-secondary"
            onClick={tab === 'runs' ? runs.reload : schedules.reload}
          >
            {t('admin.runs.retryLoad')}
          </button>
        </div>
      ) : tab === 'runs' ? (
        <div className="table-card" aria-busy={loading === 'loading'}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('admin.runs.columns.started')}</th>
                <th scope="col">{t('admin.runs.columns.user')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.runs.columns.trigger')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.runs.columns.sources')}
                </th>
                <th scope="col">{t('admin.runs.columns.result')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.runs.columns.jobs')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.runs.columns.problems')}
                </th>
                <th scope="col">{t('admin.runs.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.state.status === 'ready' &&
              runs.state.data &&
              runs.state.data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted">
                    {t('admin.runs.empty')}
                  </td>
                </tr>
              ) : null}
              {(runs.state.status === 'ready' ? (runs.state.data?.items ?? []) : []).map((run) => (
                <tr key={run.id}>
                  <td>{formatDate(run.startedAt, i18n.language, true)}</td>
                  <td className="cell-wrap">{who(run)}</td>
                  <td className="col-optional">{t(`admin.runs.triggers.${run.trigger}`)}</td>
                  <td className="col-optional cell-wrap">
                    {run.sourceKeys.map(sourceName).join(', ')}
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[run.status]}`}>
                      {t(`admin.runs.statuses.${run.status}`)}
                    </span>
                  </td>
                  <td className="col-optional">
                    {t('admin.runs.jobsCount', { found: run.jobsFound, new: run.jobsNew })}
                  </td>
                  <td className="col-optional cell-wrap">{problem(run)}</td>
                  <td>
                    <div className="action-row">
                      <Link to={`/research-runs/${run.id}`} className="table-link">
                        {t('admin.runs.details')}
                      </Link>
                      {canRetry(run.status) ? (
                        <button
                          type="button"
                          className="button-secondary button-small"
                          onClick={() => setPending({ kind: 'retry', run })}
                        >
                          {t('admin.runs.retry')}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-card" aria-busy={loading === 'loading'}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('admin.runs.schedules.columns.user')}</th>
                <th scope="col">{t('admin.runs.schedules.columns.when')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.runs.schedules.columns.next')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.runs.schedules.columns.last')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.runs.schedules.columns.runs')}
                </th>
                <th scope="col">{t('admin.runs.schedules.columns.state')}</th>
                <th scope="col">{t('admin.runs.schedules.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {schedules.state.status === 'ready' &&
              schedules.state.data &&
              schedules.state.data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    {t('admin.runs.schedules.empty')}
                  </td>
                </tr>
              ) : null}
              {(schedules.state.status === 'ready' ? (schedules.state.data?.items ?? []) : []).map(
                (s) => (
                  <tr key={s.id}>
                    <td className="cell-wrap">{who(s)}</td>
                    <td>{when(s)}</td>
                    <td className="col-optional">
                      {s.nextRunAt
                        ? formatDate(s.nextRunAt, i18n.language, true)
                        : t('admin.runs.detail.none')}
                    </td>
                    <td className="col-optional">
                      {s.lastRunAt ? (
                        s.lastRunId ? (
                          <Link to={`/research-runs/${s.lastRunId}`} className="table-link">
                            {formatDate(s.lastRunAt, i18n.language, true)}
                          </Link>
                        ) : (
                          formatDate(s.lastRunAt, i18n.language, true)
                        )
                      ) : (
                        t('admin.runs.schedules.never')
                      )}
                      {s.lastSkip ? (
                        <span className="cell-note muted">
                          {t(`admin.runs.schedules.skips.${s.lastSkip}`)}
                        </span>
                      ) : null}
                    </td>
                    <td className="col-optional">{s.runCount}</td>
                    <td>
                      <span className={`badge ${s.enabled ? 'badge-active' : 'badge-suspended'}`}>
                        {t(`admin.runs.schedules.${s.enabled ? 'active' : 'paused'}`)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button-secondary button-small"
                        onClick={() =>
                          setPending({ kind: s.enabled ? 'pause' : 'resume', schedule: s })
                        }
                      >
                        {t(`admin.runs.schedules.${s.enabled ? 'pause' : 'resume'}`)}
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {pageData && pageData.total > RUNS_PAGE_SIZE ? (
        <nav className="pager" aria-label={t('admin.runs.title')}>
          <span className="muted">
            {t('admin.users.range', { from, to, total: pageData.total })}
          </span>
          <button
            type="button"
            className="button-secondary"
            disabled={pageData.page <= 1}
            onClick={() => go({ page: pageData.page - 1 })}
          >
            {t('admin.users.previous')}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={to >= pageData.total}
            onClick={() => go({ page: pageData.page + 1 })}
          >
            {t('admin.users.next')}
          </button>
        </nav>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        message={
          !pending
            ? ''
            : pending.kind === 'retry'
              ? t('admin.runs.confirmRetry', {
                  email: pending.run.email ?? t('admin.runs.deletedUser'),
                })
              : t(
                  pending.kind === 'pause'
                    ? 'admin.runs.schedules.confirmPause'
                    : 'admin.runs.schedules.confirmResume',
                  { email: pending.schedule.email ?? t('admin.runs.deletedUser') },
                )
        }
        confirmLabel={
          pending?.kind === 'retry'
            ? t('admin.runs.confirmYes')
            : pending?.kind === 'pause'
              ? t('admin.runs.schedules.pause')
              : t('admin.runs.schedules.resume')
        }
        cancelLabel={t('admin.runs.cancel')}
        danger={pending?.kind === 'pause'}
        busy={busy}
        onConfirm={() => void confirm()}
        onCancel={() => setPending(null)}
      />
    </>
  );
}
