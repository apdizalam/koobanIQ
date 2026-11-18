import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/authContext';
import { RegionCitiesCard } from '../components/sources/RegionCitiesCard';
import { SourceEditDialog } from '../components/sources/SourceEditDialog';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useLoad } from '../hooks/useLoad';
import { ApiError } from '../services/api';
import {
  enableBlocker,
  errorPercent,
  fetchJobSources,
  fetchRegions,
  updateJobSource,
} from '../services/jobSourcesApi';
import type { AdminJobSource, SourceChanges } from '../types/jobSources';
import { formatDate } from '../utils/format';

type Pending = { kind: 'enable' | 'disable'; source: AdminJobSource } | null;

/**
 * Admin → Job sources (doc 9 §8): every source with its terms check, adapter and
 * health; switch on/off and edit regions, employer types and order. Below it, the
 * city suggestions per region. Every change is written to the audit log.
 */
export function JobSourcesPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const sources = useLoad('job-sources', () => fetchJobSources(request));
  const regions = useLoad('regions', () => fetchRegions(request));

  const [pending, setPending] = useState<Pending>(null);
  const [editing, setEditing] = useState<AdminJobSource | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'notice' | 'alert'; text: string } | null>(null);

  // While reloading after a change, keep showing the last list (no flicker).
  const list =
    sources.state.status === 'ready'
      ? sources.state.data.sources
      : (sources.previous?.sources ?? null);

  const failText = (err: unknown) =>
    // The server already answers in the admin's language (TIQ-30).
    err instanceof ApiError ? err.message : t('admin.errors.generic');

  async function confirmToggle() {
    if (!pending) return;
    const { kind, source } = pending;
    setBusy(true);
    try {
      await updateJobSource(request, source.key, { enabled: kind === 'enable' });
      setMessage({ kind: 'notice', text: t(`admin.sources.done.${kind}`, { name: source.name }) });
      sources.reload();
    } catch (err) {
      setMessage({ kind: 'alert', text: failText(err) });
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function saveEdit(changes: Omit<SourceChanges, 'enabled'>) {
    if (!editing) return;
    setBusy(true);
    setEditError(null);
    try {
      await updateJobSource(request, editing.key, changes);
      setMessage({
        kind: 'notice',
        text: t('admin.sources.done.update', { name: editing.name }),
      });
      setEditing(null);
      sources.reload();
    } catch (err) {
      setEditError(failText(err));
    } finally {
      setBusy(false);
    }
  }

  function health(source: AdminJobSource) {
    const last = source.lastSuccessAt
      ? t('admin.sources.lastSuccess', {
          time: formatDate(source.lastSuccessAt, i18n.language, true),
        })
      : t('admin.sources.neverSucceeded');
    return (
      <>
        <span className={`badge ${source.errorRate >= 0.5 ? 'badge-suspended' : 'badge-active'}`}>
          {t('admin.sources.health', { percent: errorPercent(source.errorRate) })}
        </span>
        <span className="cell-note muted">{last}</span>
      </>
    );
  }

  function actions(source: AdminJobSource) {
    const blocker = enableBlocker(source);
    return (
      <div className="action-row">
        {source.enabled ? (
          <button
            type="button"
            className="button-secondary button-small"
            onClick={() => setPending({ kind: 'disable', source })}
          >
            {t('admin.sources.disable')}
          </button>
        ) : (
          <button
            type="button"
            className="button-secondary button-small"
            disabled={blocker !== null}
            onClick={() => setPending({ kind: 'enable', source })}
          >
            {t('admin.sources.enable')}
          </button>
        )}
        <button
          type="button"
          className="button-secondary button-small"
          onClick={() => {
            setEditError(null);
            setEditing(source);
          }}
        >
          {t('admin.sources.edit')}
        </button>
        {blocker ? (
          <span className="cell-note muted">{t(`admin.sources.blocked.${blocker}`)}</span>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <header className="page-header">
        <h1>{t('admin.sources.title')}</h1>
        <p className="muted">{t('admin.sources.subtitle')}</p>
      </header>

      {message ? (
        <p className={message.kind} role={message.kind === 'alert' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}

      {sources.state.status === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.sources.error')}</span>
          <button type="button" className="button-secondary" onClick={sources.reload}>
            {t('admin.users.retry')}
          </button>
        </div>
      ) : (
        <div className="table-card" aria-busy={sources.state.status === 'loading'}>
          <table className="table table-wide">
            <thead>
              <tr>
                <th scope="col">{t('admin.sources.columns.source')}</th>
                <th scope="col">{t('admin.sources.columns.status')}</th>
                <th scope="col">{t('admin.sources.columns.regions')}</th>
                <th scope="col">{t('admin.sources.columns.terms')}</th>
                <th scope="col">{t('admin.sources.columns.adapter')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.sources.columns.health')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.sources.columns.priority')}
                </th>
                <th scope="col">{t('admin.sources.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {!list ? (
                <tr>
                  <td colSpan={8}>
                    <span className="row-skeleton" aria-hidden="true" />
                  </td>
                </tr>
              ) : null}
              {list && list.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted cell-wrap">
                    {t('admin.sources.empty')}
                  </td>
                </tr>
              ) : null}
              {list?.map((source) => (
                <tr key={source.key}>
                  <td>
                    <strong>{source.name}</strong>
                    <span className="cell-note muted">
                      {t(`admin.sources.types.${source.type}`)} · {source.key}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${source.enabled ? 'badge-active' : 'badge-user'}`}>
                      {t(`admin.sources.statuses.${source.enabled ? 'enabled' : 'disabled'}`)}
                    </span>
                  </td>
                  <td>
                    {source.regions.length > 0
                      ? source.regions.map((r) => t(`common.region.${r}`)).join(', ')
                      : t('admin.sources.none')}
                  </td>
                  <td>
                    {source.termsCheckedAt ? (
                      t('admin.sources.termsChecked', {
                        date: formatDate(source.termsCheckedAt, i18n.language),
                      })
                    ) : (
                      <span className="badge badge-suspended">
                        {t('admin.sources.termsNotChecked')}
                      </span>
                    )}
                    {source.termsUrl ? (
                      <a
                        className="table-link cell-note"
                        href={source.termsUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('admin.sources.termsLink')}
                      </a>
                    ) : null}
                  </td>
                  <td>
                    {source.hasAdapter ? (
                      t('admin.sources.adapterReady')
                    ) : (
                      <span className="badge badge-suspended">
                        {t('admin.sources.adapterMissing')}
                      </span>
                    )}
                  </td>
                  <td className="col-optional">{health(source)}</td>
                  <td className="col-optional">{source.priority}</td>
                  <td className="cell-actions">{actions(source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="page-section" aria-labelledby="regions-title">
        <header className="page-header">
          <h2 id="regions-title">{t('admin.regions.title')}</h2>
          <p className="muted">{t('admin.regions.subtitle')}</p>
        </header>
        {regions.state.status === 'error' ? (
          <div className="alert alert-row" role="alert">
            <span>{t('admin.regions.error')}</span>
            <button type="button" className="button-secondary" onClick={regions.reload}>
              {t('admin.users.retry')}
            </button>
          </div>
        ) : null}
        {regions.state.status === 'loading' ? (
          <p className="muted" role="status">
            {t('common.loading')}
          </p>
        ) : null}
        {regions.state.status === 'ready' ? (
          <div className="region-grid">
            {regions.state.data.regions.map((region) => (
              <RegionCitiesCard key={region.key} region={region} />
            ))}
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={pending !== null}
        message={
          pending ? t(`admin.sources.confirm.${pending.kind}`, { name: pending.source.name }) : ''
        }
        confirmLabel={t('admin.sources.confirm.yes')}
        cancelLabel={t('admin.sources.confirm.cancel')}
        danger={pending?.kind === 'disable'}
        busy={busy}
        onConfirm={() => void confirmToggle()}
        onCancel={() => setPending(null)}
      />
      <SourceEditDialog
        source={editing}
        busy={busy}
        error={editError}
        onSave={(changes) => void saveEdit(changes)}
        onCancel={() => setEditing(null)}
      />
    </>
  );
}
