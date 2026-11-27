import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { StatCard } from '../components/ui/StatCard';
import { useWaitlist } from '../hooks/useWaitlist';
import { WAITLIST_PAGE_SIZE, type WaitlistFilters } from '../services/waitlistApi';
import { formatDate } from '../utils/format';

/** Read the search from the address (?q=&page=), so links and Back keep it. */
function readFilters(params: URLSearchParams): WaitlistFilters {
  return {
    q: params.get('q') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
}

/**
 * Admin → Waitlist: everyone who joined from the landing page, newest first,
 * searchable by email or name. Read-only; the CSV download is on Reports.
 */
export function WaitlistPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [search, setSearch] = useState(filters.q);
  const { state, reload } = useWaitlist(filters);

  function update(next: Partial<WaitlistFilters>) {
    const merged = { ...filters, page: 1, ...next };
    const out: Record<string, string> = {};
    if (merged.q) out.q = merged.q;
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
  const from = data && data.matching > 0 ? (data.page - 1) * data.limit + 1 : 0;
  const to = data ? Math.min(data.page * data.limit, data.matching) : 0;
  const range = t('admin.waitlist.range', { from, to, total: data?.matching ?? 0 });

  return (
    <>
      <header className="page-header">
        <h1>{t('admin.waitlist.title')}</h1>
        <p className="muted">{t('admin.waitlist.subtitle')}</p>
      </header>

      <section className="stat-grid" aria-label={t('admin.waitlist.title')}>
        <StatCard
          label={t('admin.waitlist.total')}
          value={data ? data.total : state.status === 'error' ? '–' : null}
          hint={t('admin.waitlist.totalHint')}
        />
      </section>

      <div className="toolbar">
        <input
          type="search"
          className="input"
          placeholder={t('admin.waitlist.search')}
          aria-label={t('admin.waitlist.searchLabel')}
          value={search}
          maxLength={100}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {state.status === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.waitlist.error')}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t('admin.waitlist.retry')}
          </button>
        </div>
      ) : (
        <div className="table-card" aria-busy={state.status === 'loading'}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('admin.waitlist.columns.email')}</th>
                <th scope="col">{t('admin.waitlist.columns.name')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.waitlist.columns.language')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.waitlist.columns.consent')}
                </th>
                <th scope="col">{t('admin.waitlist.columns.joined')}</th>
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
                    {filters.q ? t('admin.waitlist.noMatch') : t('admin.waitlist.empty')}
                  </td>
                </tr>
              ) : null}
              {data?.items.map((person) => (
                <tr key={person.id}>
                  <td>{person.email}</td>
                  <td>
                    {person.name ?? <span className="muted">{t('admin.waitlist.noName')}</span>}
                  </td>
                  <td className="col-optional">{t(`common.language.${person.language}`)}</td>
                  <td className="col-optional">
                    {t('admin.waitlist.agreed', {
                      date: formatDate(person.consentAt, i18n.language, true),
                    })}
                  </td>
                  <td>{formatDate(person.createdAt, i18n.language, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.matching > WAITLIST_PAGE_SIZE ? (
        <nav className="pager" aria-label={t('admin.waitlist.title')}>
          <span className="muted">{range}</span>
          <button
            type="button"
            className="button-secondary"
            disabled={data.page <= 1}
            onClick={() => update({ page: data.page - 1 })}
          >
            {t('admin.waitlist.previous')}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={to >= data.matching}
            onClick={() => update({ page: data.page + 1 })}
          >
            {t('admin.waitlist.next')}
          </button>
        </nav>
      ) : data ? (
        <p className="muted pager-note">{range}</p>
      ) : null}

      <p className="muted">
        {t('admin.waitlist.exportHint')}{' '}
        <Link to="/reports" className="table-link">
          {t('admin.waitlist.exportLink')}
        </Link>
      </p>
    </>
  );
}
