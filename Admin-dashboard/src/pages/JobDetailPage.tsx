import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useLoad } from '../hooks/useLoad';
import { ApiError } from '../services/api';
import { fetchJobSources } from '../services/jobSourcesApi';
import {
  REMOVE_REASONS,
  fetchJob,
  placeLabel,
  removeJob,
  restoreJob,
  type AdminJobDetail,
  type JobState,
  type RemoveReason,
} from '../services/jobsApi';
import { formatDate } from '../utils/format';

const STATE_BADGE: Record<JobState, string> = {
  active: 'badge-active',
  expired: 'badge-test',
  removed: 'badge-suspended',
};

/**
 * Admin → one stored job: its facts, how it matched users (score, level fit,
 * skills found and missing), and remove (with a reason) / restore.
 */
export function JobDetailPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const id = useParams().id ?? '';
  const loaded = useLoad(`job:${id}`, () => fetchJob(request, id));
  const sources = useLoad('job-sources', () => fetchJobSources(request));
  const sourceName = (key: string) =>
    (sources.state.status === 'ready'
      ? sources.state.data.sources.find((s) => s.key === key)?.name
      : undefined) ?? key;

  const [updated, setUpdated] = useState<AdminJobDetail | null>(null);
  const job = updated ?? (loaded.state.status === 'ready' ? loaded.state.data : null);
  const [reason, setReason] = useState<RemoveReason>('invalid');
  const [pending, setPending] = useState<'remove' | 'restore' | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'notice' | 'alert'; text: string } | null>(null);
  const none = t('admin.jobs.detail.none');
  const date = (iso: string | null, withTime = false) =>
    iso ? formatDate(iso, i18n.language, withTime) : none;

  async function confirm() {
    if (!job || !pending) return;
    setBusy(true);
    try {
      setUpdated(
        pending === 'remove'
          ? await removeJob(request, job.id, reason)
          : await restoreJob(request, job.id),
      );
      setMessage({
        kind: 'notice',
        text: t(
          pending === 'remove' ? 'admin.jobs.detail.doneRemove' : 'admin.jobs.detail.doneRestore',
        ),
      });
    } catch (err) {
      setMessage({
        kind: 'alert',
        text: err instanceof ApiError ? err.message : t('admin.errors.generic'),
      });
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  return (
    <>
      <p>
        <Link to="/jobs" className="table-link">
          {t('admin.jobs.back')}
        </Link>
      </p>

      {loaded.state.status === 'error' && !updated ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.jobs.detail.notFound')}</span>
          <button type="button" className="button-secondary" onClick={loaded.reload}>
            {t('admin.jobs.retry')}
          </button>
        </div>
      ) : null}

      {job ? (
        <>
          <header className="page-header page-header-row">
            <div className="page-title">
              <h1 className="break-anywhere">{job.title}</h1>
              <p>
                <span className={`badge ${STATE_BADGE[job.state]}`}>
                  {t(`admin.jobs.states.${job.state}`)}
                </span>
              </p>
            </div>
            {job.state === 'removed' ? (
              <button
                type="button"
                className="button-secondary"
                disabled={busy}
                onClick={() => setPending('restore')}
              >
                {t('admin.jobs.detail.restore')}
              </button>
            ) : (
              <div className="action-row">
                <label className="select-field">
                  <span>{t('admin.jobs.detail.reasonLabel')}</span>
                  <select
                    value={reason}
                    disabled={busy}
                    onChange={(e) => setReason(e.target.value as RemoveReason)}
                  >
                    {REMOVE_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {t(`admin.jobs.reasons.${r}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={busy}
                  onClick={() => setPending('remove')}
                >
                  {t('admin.jobs.detail.remove')}
                </button>
              </div>
            )}
          </header>

          {message ? (
            <p className={message.kind} role={message.kind === 'alert' ? 'alert' : 'status'}>
              {message.text}
            </p>
          ) : null}

          {job.removedAt ? (
            <p className="notice">
              {t('admin.jobs.detail.removed', {
                date: date(job.removedAt, true),
                by: job.removedBy ?? none,
                reason: job.removedReason ? t(`admin.jobs.reasons.${job.removedReason}`) : none,
              })}
            </p>
          ) : null}

          <section className="card">
            <dl className="details">
              <dt>{t('admin.jobs.detail.employer')}</dt>
              <dd>{job.employer}</dd>
              <dt>{t('admin.jobs.detail.place')}</dt>
              <dd>{placeLabel(job.city, t(`common.region.${job.region}`))}</dd>
              <dt>{t('admin.jobs.detail.sources')}</dt>
              <dd>{job.sourceKeys.map(sourceName).join(', ')}</dd>
              <dt>{t('admin.jobs.detail.apply')}</dt>
              <dd className="break-anywhere">
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="table-link"
                >
                  {job.applyUrl}
                </a>
              </dd>
              <dt>{t('admin.jobs.detail.deadline')}</dt>
              <dd>{job.deadline ? date(job.deadline) : t('admin.jobs.noDeadline')}</dd>
              <dt>{t('admin.jobs.detail.posted')}</dt>
              <dd>{date(job.postedAt)}</dd>
              <dt>{t('admin.jobs.detail.seen')}</dt>
              <dd>
                {date(job.firstSeenAt)} / {date(job.lastSeenAt)}
              </dd>
              <dt>{t('admin.jobs.detail.saved')}</dt>
              <dd>{t('admin.jobs.detail.savedValue', { count: job.saved })}</dd>
            </dl>
          </section>

          <h2 className="section-title">{t('admin.jobs.detail.matches')}</h2>
          <p className="muted">{t('admin.jobs.detail.matchesNote')}</p>
          {job.matches.length === 0 ? (
            <p className="muted">{t('admin.jobs.detail.noMatches')}</p>
          ) : (
            <div className="table-card">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">{t('admin.jobs.detail.matchColumns.user')}</th>
                    <th scope="col">{t('admin.jobs.detail.matchColumns.score')}</th>
                    <th scope="col" className="col-optional">
                      {t('admin.jobs.detail.matchColumns.levelFit')}
                    </th>
                    <th scope="col" className="col-optional">
                      {t('admin.jobs.detail.matchColumns.matched')}
                    </th>
                    <th scope="col">{t('admin.jobs.detail.matchColumns.missing')}</th>
                    <th scope="col" className="col-optional">
                      {t('admin.jobs.detail.matchColumns.when')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {job.matches.map((m) => (
                    <tr key={m.userId}>
                      <td className="cell-wrap">
                        {m.email ? (
                          <Link to={`/users/${m.userId}`} className="table-link">
                            {m.email}
                          </Link>
                        ) : (
                          <span className="muted">{t('admin.jobs.deletedUser')}</span>
                        )}
                      </td>
                      <td>
                        {t('admin.jobs.detail.scoreValue', {
                          score: m.score,
                          category: t(`admin.jobs.categories.${m.category}`),
                        })}
                      </td>
                      <td className="col-optional">
                        {t('admin.jobs.detail.levelValue', {
                          fit: t(`admin.jobs.levelFits.${m.levelFit}`),
                          user: m.userLevel ?? none,
                          job: m.jobLevel ?? none,
                        })}
                      </td>
                      <td className="col-optional cell-wrap">
                        {m.matchedSkills.join(', ') || none}
                      </td>
                      <td className="cell-wrap">{m.missingRequired.join(', ') || none}</td>
                      <td className="col-optional">{date(m.computedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ConfirmDialog
            open={pending !== null}
            message={t(
              pending === 'restore'
                ? 'admin.jobs.detail.confirmRestore'
                : 'admin.jobs.detail.confirmRemove',
              { title: job.title },
            )}
            confirmLabel={
              pending === 'restore' ? t('admin.jobs.detail.restore') : t('admin.jobs.confirmYes')
            }
            cancelLabel={t('admin.jobs.cancel')}
            danger={pending === 'remove'}
            busy={busy}
            onConfirm={() => void confirm()}
            onCancel={() => setPending(null)}
          />
        </>
      ) : null}
    </>
  );
}
