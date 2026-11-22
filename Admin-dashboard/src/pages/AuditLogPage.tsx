import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { useLoad } from '../hooks/useLoad';
import { AUDIT_PAGE_SIZE, actionKey, describeChange, fetchAuditLogs } from '../services/auditApi';
import { AUDIT_ACTIONS, type AuditAction, type AuditEntry } from '../types/audit';
import {
  EMPLOYER_TYPES,
  REGION_KEYS,
  type EmployerType,
  type RegionKey,
} from '../types/jobSources';
import { REMOVE_REASONS, type RemoveReason } from '../services/jobsApi';
import { isRunStatus } from '../types/research';
import { formatDate } from '../utils/format';

const isRemoveReason = (v: string): v is RemoveReason =>
  (REMOVE_REASONS as readonly string[]).includes(v);
const isRegionKey = (v: string): v is RegionKey => (REGION_KEYS as readonly string[]).includes(v);
const isEmployerType = (v: string): v is EmployerType =>
  (EMPLOYER_TYPES as readonly string[]).includes(v);

const isAction = (v: string | null): v is AuditAction =>
  v !== null && (AUDIT_ACTIONS as readonly string[]).includes(v);

/** Admin → Audit log: who did what, to whom, and when (read-only). */
export function AuditLogPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('action');
  const action: '' | AuditAction = isAction(fromUrl) ? fromUrl : '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const { state, reload } = useLoad(`audit:${action}:${page}`, () =>
    fetchAuditLogs(request, { action, page }),
  );
  const data = state.status === 'ready' ? state.data : null;
  const from = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0;
  const to = data ? Math.min(data.page * data.limit, data.total) : 0;

  function go(next: { action?: '' | AuditAction; page?: number }) {
    const merged = { action, page: 1, ...next };
    const out: Record<string, string> = {};
    if (merged.action) out.action = merged.action;
    if (merged.page > 1) out.page = String(merged.page);
    setParams(out, { replace: true });
  }

  /**
   * A changed value in the admin's language: "Active" for statuses, "Admin" for
   * roles, "On/Off" for a source switch, region and employer-type names; lists
   * are joined. Anything else is shown as it is.
   */
  function value(field: string, raw: unknown): string {
    if (raw === null || raw === undefined || raw === '') return t('admin.audit.noChange');
    if (Array.isArray(raw)) {
      return raw.length === 0
        ? t('admin.sources.none')
        : raw.map((item) => value(field, item)).join(', ');
    }
    if (field === 'testAccount' && typeof raw === 'boolean') {
      return t(`admin.users.${raw ? 'yes' : 'no'}`);
    }
    if (field === 'value' && (raw === 'blocked' || raw === 'allowed')) {
      return t(`admin.privacy.values.${raw}`);
    }
    if (field === 'removed' && typeof raw === 'boolean') {
      return t(raw ? 'admin.jobs.states.removed' : 'admin.jobs.states.active');
    }
    if (field === 'reason' && typeof raw === 'string' && isRemoveReason(raw)) {
      return t(`admin.jobs.reasons.${raw}`);
    }
    if (field === 'enabled' && typeof raw === 'boolean') {
      return t(`admin.audit.values.${raw ? 'on' : 'off'}`);
    }
    const text = String(raw);
    if (field === 'status' && (text === 'active' || text === 'suspended')) {
      return t(`admin.users.statuses.${text}`);
    }
    if (field === 'status' && isRunStatus(text)) return t(`admin.runs.statuses.${text}`);
    if (field === 'role' && (text === 'user' || text === 'admin')) {
      return t(`admin.users.roles.${text}`);
    }
    if (field === 'regions' && isRegionKey(text)) return t(`common.region.${text}`);
    if (field === 'employerTypes' && isEmployerType(text)) {
      return t(`common.employerType.${text}`);
    }
    return text;
  }

  function change(entry: AuditEntry) {
    if (entry.action === 'user.delete') return t('admin.audit.deleted');
    const parts = describeChange(entry);
    if (parts.length === 0) return t('admin.audit.noChange');
    // Parts are split by ";" because a list value already uses commas.
    return parts.map((p) => `${value(p.field, p.from)} → ${value(p.field, p.to)}`).join('; ');
  }

  return (
    <>
      <header className="page-header">
        <h1>{t('admin.audit.title')}</h1>
        <p className="muted">{t('admin.audit.subtitle')}</p>
      </header>

      <div className="toolbar">
        <label className="select-field">
          <span>{t('admin.audit.actionFilter')}</span>
          <select value={action} onChange={(e) => go({ action: e.target.value as AuditAction })}>
            <option value="">{t('admin.audit.all')}</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {t(`admin.audit.actions.${actionKey(a) as 'user_suspend'}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.status === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.audit.error')}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t('admin.users.retry')}
          </button>
        </div>
      ) : (
        <div className="table-card" aria-busy={state.status === 'loading'}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('admin.audit.columns.when')}</th>
                <th scope="col">{t('admin.audit.columns.action')}</th>
                <th scope="col">{t('admin.audit.columns.target')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.audit.columns.who')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.audit.columns.change')}
                </th>
              </tr>
            </thead>
            <tbody>
              {state.status === 'loading'
                ? Array.from({ length: 3 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={5}>
                        <span className="row-skeleton" aria-hidden="true" />
                      </td>
                    </tr>
                  ))
                : null}
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted">
                    {t('admin.audit.empty')}
                  </td>
                </tr>
              ) : null}
              {data?.items.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.at, i18n.language, true)}</td>
                  <td>
                    <span
                      className={`badge ${entry.action === 'admin.access_denied' ? 'badge-suspended' : 'badge-user'}`}
                    >
                      {isAction(entry.action)
                        ? t(`admin.audit.actions.${actionKey(entry.action) as 'user_suspend'}`)
                        : entry.action}
                    </span>
                  </td>
                  <td className="cell-wrap">{entry.target ?? t('admin.audit.noChange')}</td>
                  <td className="col-optional">{entry.actor}</td>
                  <td className="col-optional cell-wrap">
                    {change(entry)}
                    {entry.reason ? (
                      <span className="muted audit-reason">
                        {t('admin.audit.reason', { reason: entry.reason })}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > AUDIT_PAGE_SIZE ? (
        <nav className="pager" aria-label={t('admin.audit.title')}>
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
      ) : data ? (
        <p className="muted pager-note">
          {t('admin.users.range', { from, to, total: data.total })}
        </p>
      ) : null}
    </>
  );
}
