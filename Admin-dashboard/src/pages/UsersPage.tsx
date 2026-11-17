import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useUsers } from '../hooks/useUsers';
import { PAGE_SIZE } from '../services/adminUsersApi';
import type { UserFilters } from '../types/adminUsers';
import { formatDate } from '../utils/format';

const ROLES = ['user', 'admin'] as const;
const STATUSES = ['active', 'suspended'] as const;

/** Read the filters from the address (?q=&role=&status=&page=), so links and Back keep them. */
function readFilters(params: URLSearchParams): UserFilters {
  const role = params.get('role');
  const status = params.get('status');
  return {
    q: params.get('q') ?? '',
    role: role === 'user' || role === 'admin' ? role : '',
    status: status === 'active' || status === 'suspended' ? status : '',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

/** Admin → Users: search, filter, page through every account. */
export function UsersPage() {
  const { t, i18n } = useTranslation();
  const flash = (useLocation().state as { flash?: string } | null)?.flash;
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [search, setSearch] = useState(filters.q);
  const { state, reload } = useUsers(filters);

  function update(next: Partial<UserFilters>) {
    const merged = { ...filters, page: 1, ...next };
    const out: Record<string, string> = {};
    if (merged.q) out.q = merged.q;
    if (merged.role) out.role = merged.role;
    if (merged.status) out.status = merged.status;
    if (merged.page > 1) out.page = String(merged.page);
    setParams(out, { replace: true });
  }

  // Search after the admin stops typing for a moment.
  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => update({ q: search }), 300);
    return () => clearTimeout(timer);
  });

  const data = state.status === 'ready' ? state.data : null;
  const from = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0;
  const to = data ? Math.min(data.page * data.limit, data.total) : 0;

  return (
    <>
      <header className="page-header">
        <h1>{t('admin.users.title')}</h1>
        <p className="muted">{t('admin.users.subtitle')}</p>
      </header>

      {flash ? (
        <p className="notice" role="status">
          {flash}
        </p>
      ) : null}

      <div className="toolbar">
        <input
          type="search"
          className="input"
          placeholder={t('admin.users.search')}
          aria-label={t('admin.users.searchLabel')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="select-field">
          <span>{t('admin.users.roleFilter')}</span>
          <select
            value={filters.role}
            onChange={(e) => update({ role: e.target.value as UserFilters['role'] })}
          >
            <option value="">{t('admin.users.all')}</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`admin.users.roles.${role}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="select-field">
          <span>{t('admin.users.statusFilter')}</span>
          <select
            value={filters.status}
            onChange={(e) => update({ status: e.target.value as UserFilters['status'] })}
          >
            <option value="">{t('admin.users.all')}</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`admin.users.statuses.${status}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.status === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.users.error')}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t('admin.users.retry')}
          </button>
        </div>
      ) : (
        <div className="table-card" aria-busy={state.status === 'loading'}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('admin.users.columns.email')}</th>
                <th scope="col">{t('admin.users.columns.role')}</th>
                <th scope="col">{t('admin.users.columns.status')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.users.columns.language')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.users.columns.lastActive')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.users.columns.joined')}
                </th>
              </tr>
            </thead>
            <tbody>
              {state.status === 'loading'
                ? Array.from({ length: 3 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={6}>
                        <span className="row-skeleton" aria-hidden="true" />
                      </td>
                    </tr>
                  ))
                : null}
              {data && data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted">
                    {t('admin.users.empty')}
                  </td>
                </tr>
              ) : null}
              {data?.items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link to={`/users/${user.id}`} className="table-link">
                      {user.email}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge badge-${user.role}`}>
                      {t(`admin.users.roles.${user.role}`)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${user.status}`}>
                      {t(`admin.users.statuses.${user.status}`)}
                    </span>
                  </td>
                  <td className="col-optional">{t(`common.language.${user.preferredLanguage}`)}</td>
                  <td className="col-optional">
                    {user.lastActiveAt
                      ? formatDate(user.lastActiveAt, i18n.language, true)
                      : t('admin.users.never')}
                  </td>
                  <td className="col-optional">{formatDate(user.createdAt, i18n.language)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.total > PAGE_SIZE ? (
        <nav className="pager" aria-label={t('admin.users.title')}>
          <span className="muted">{t('admin.users.range', { from, to, total: data.total })}</span>
          <button
            type="button"
            className="button-secondary"
            disabled={data.page <= 1}
            onClick={() => update({ page: data.page - 1 })}
          >
            {t('admin.users.previous')}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={to >= data.total}
            onClick={() => update({ page: data.page + 1 })}
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
