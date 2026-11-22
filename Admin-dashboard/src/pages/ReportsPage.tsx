import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { ApiError } from '../services/api';
import {
  EXPORT_KINDS,
  EXPORT_PERIODS,
  fetchExport,
  isExportPeriod,
  saveCsv,
  type ExportKind,
  type ExportPeriod,
} from '../services/reportsApi';

/**
 * Admin → Reports (TIQ-33): download users, AI usage, research runs, jobs, CV
 * status and skill quizzes as CSV files for a period. Every download is audited
 * on the server. The period lives in the address.
 */
export function ReportsPage() {
  const { t } = useTranslation();
  const { request } = useAuth();
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('period');
  const period: ExportPeriod = isExportPeriod(fromUrl) ? fromUrl : 'month';
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [message, setMessage] = useState<{ kind: 'notice' | 'alert'; text: string } | null>(null);

  async function download(kind: ExportKind) {
    setBusy(kind);
    setMessage(null);
    try {
      const file = await fetchExport(request, kind, period);
      saveCsv(file);
      setMessage({
        kind: 'notice',
        text: [
          t('admin.reports.done', { file: file.filename, count: file.rows }),
          file.truncated ? t('admin.reports.truncated') : '',
        ]
          .filter(Boolean)
          .join(' '),
      });
    } catch (err) {
      setMessage({
        kind: 'alert',
        text: err instanceof ApiError ? err.message : t('admin.errors.generic'),
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="page-header page-header-row">
        <div className="page-title">
          <h1>{t('admin.reports.title')}</h1>
          <p className="muted">{t('admin.reports.subtitle')}</p>
        </div>
        <label className="select-field">
          <span>{t('admin.reports.periodLabel')}</span>
          <select
            value={period}
            onChange={(e) =>
              setParams(e.target.value === 'month' ? {} : { period: e.target.value }, {
                replace: true,
              })
            }
          >
            {EXPORT_PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`admin.reports.periods.${p}`)}
              </option>
            ))}
          </select>
        </label>
      </header>

      {message ? (
        <p className={message.kind} role={message.kind === 'alert' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}

      <section className="stat-grid" aria-label={t('admin.reports.title')}>
        {EXPORT_KINDS.map((kind) => (
          <article key={kind} className="stat-card report-card">
            <p className="stat-label">{t(`admin.reports.kinds.${kind}.label`)}</p>
            <p className="stat-hint">{t(`admin.reports.kinds.${kind}.note`)}</p>
            <button
              type="button"
              className="button-secondary"
              disabled={busy !== null}
              onClick={() => void download(kind)}
            >
              {busy === kind ? t('admin.reports.downloading') : t('admin.reports.download')}
            </button>
          </article>
        ))}
      </section>
    </>
  );
}
