import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/authContext';
import { ReasonDialog } from '../components/ui/ReasonDialog';
import { useLoad } from '../hooks/useLoad';
import { ApiError } from '../services/api';
import { fetchAiPersonalData, otherValue, updateAiPersonalData } from '../services/privacyApi';
import type { AiPersonalDataSetting } from '../types/privacy';
import { formatDate } from '../utils/format';

/**
 * Admin → AI privacy: may real users' profile data be sent to the AI provider?
 * Default BLOCKED. Any admin can switch it with a reason; the server records who,
 * when, the old and new value and the reason, and checks it on every AI request.
 */
export function AiPrivacyPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const { state, reload, previous } = useLoad('ai-personal-data', () =>
    fetchAiPersonalData(request),
  );
  const [saved, setSaved] = useState<AiPersonalDataSetting | null>(null);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loaded = state.status === 'ready' ? state.data : previous;
  // The PUT answer is the newest version until the page loads again.
  const setting = saved ?? loaded;
  const next = setting ? otherValue(setting.value) : 'allowed';
  const valueText = (v: 'blocked' | 'allowed') => t(`admin.privacy.values.${v}`);

  async function save(reason: string) {
    if (!setting) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateAiPersonalData(request, next, reason);
      setSaved(updated);
      setChanging(false);
      setNotice(t('admin.privacy.saved', { value: valueText(updated.value) }));
    } catch (err) {
      // SETTING_UNCHANGED (another admin was faster): show the server text and reload.
      setError(err instanceof ApiError ? err.message : t('admin.errors.generic'));
      if (err instanceof ApiError && err.code === 'SETTING_UNCHANGED') {
        setSaved(null);
        reload();
      }
    } finally {
      setBusy(false);
    }
  }

  const last = setting?.history[0];
  return (
    <>
      <header className="page-header">
        <h1>{t('admin.privacy.title')}</h1>
        <p className="muted">{t('admin.privacy.subtitle')}</p>
      </header>

      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}

      {state.status === 'error' && !setting ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.privacy.error')}</span>
          <button type="button" className="button-secondary" onClick={reload}>
            {t('admin.users.retry')}
          </button>
        </div>
      ) : null}
      {state.status === 'loading' && !setting ? (
        <p className="muted" role="status">
          {t('common.loading')}
        </p>
      ) : null}

      {setting ? (
        <>
          <section className="card privacy-status" aria-labelledby="privacy-status">
            <h2 id="privacy-status" className="section-title section-title-first">
              {t('admin.privacy.statusLabel')}
            </h2>
            <p>
              <span
                className={`badge ${setting.value === 'blocked' ? 'badge-active' : 'badge-suspended'}`}
              >
                {valueText(setting.value)}
              </span>
            </p>
            <p>
              {setting.value === 'blocked'
                ? t('admin.privacy.blockedExplain')
                : t('admin.privacy.allowedExplain')}
            </p>
            <p className="muted">
              {setting.isDefault || !last
                ? t('admin.privacy.isDefault')
                : t('admin.privacy.lastChange', {
                    admin: last.admin,
                    date: formatDate(last.at, i18n.language, true),
                  })}
            </p>
            <div className="action-row">
              <button
                type="button"
                className={next === 'allowed' ? 'button-danger' : 'button-primary'}
                onClick={() => {
                  setNotice(null);
                  setError(null);
                  setChanging(true);
                }}
              >
                {t('admin.privacy.changeTo', { value: valueText(next) })}
              </button>
            </div>
          </section>

          <section aria-labelledby="privacy-history">
            <h2 id="privacy-history" className="section-title">
              {t('admin.privacy.historyTitle')}
            </h2>
            {setting.history.length === 0 ? (
              <p className="muted">{t('admin.privacy.historyEmpty')}</p>
            ) : (
              <div className="table-card">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">{t('admin.privacy.columns.when')}</th>
                      <th scope="col">{t('admin.privacy.columns.change')}</th>
                      <th scope="col">{t('admin.privacy.columns.admin')}</th>
                      <th scope="col">{t('admin.privacy.columns.reason')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setting.history.map((h) => (
                      <tr key={`${h.at}-${h.adminId}`}>
                        <td>{formatDate(h.at, i18n.language, true)}</td>
                        <td>
                          {valueText(h.previous)} → {valueText(h.value)}
                        </td>
                        <td className="cell-wrap">{h.admin}</td>
                        <td className="cell-wrap">{h.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <ReasonDialog
            open={changing}
            title={t('admin.privacy.changeTitle')}
            message={t('admin.privacy.changeMessage', {
              from: valueText(setting.value),
              to: valueText(next),
            })}
            confirmText={next === 'allowed' ? t('admin.privacy.confirmAllow') : undefined}
            saveLabel={t('admin.privacy.save')}
            busy={busy}
            error={error}
            danger={next === 'allowed'}
            onSave={(reason) => void save(reason)}
            onCancel={() => {
              setChanging(false);
              setError(null);
            }}
          />
        </>
      ) : null}
    </>
  );
}
