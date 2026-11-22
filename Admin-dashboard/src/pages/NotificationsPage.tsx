import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/authContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useLoad } from '../hooks/useLoad';
import {
  AUDIENCES,
  BODY_MAX,
  TITLE_MAX,
  cleanDraft,
  draftProblem,
  fetchAnnouncements,
  fetchAudienceCounts,
  sendAnnouncement,
  type AnnouncementDraft,
  type Audience,
} from '../services/announcementsApi';
import { ApiError } from '../services/api';
import { formatDate } from '../utils/format';

const EMPTY: AnnouncementDraft = {
  title: { en: '', so: '' },
  body: { en: '', so: '' },
  audience: 'all',
  push: true,
};

type TextKey = 'titleEn' | 'titleSo' | 'bodyEn' | 'bodySo';

/**
 * Admin → Notifications (TIQ-33): write an announcement in English and Somali,
 * choose who gets it (all / English / Somali app users) and whether a push goes
 * too; each user sees it in their own language. Below: what was sent, with how
 * many got and read it.
 */
export function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const { request } = useAuth();
  const history = useLoad('announcements', () => fetchAnnouncements(request));
  const counts = useLoad('audience-counts', () => fetchAudienceCounts(request));

  const [draft, setDraft] = useState<AnnouncementDraft>(EMPTY);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'notice' | 'alert'; text: string } | null>(null);

  const countOf = (a: Audience) => (counts.state.status === 'ready' ? counts.state.data[a] : 0);
  const problem = draftProblem(draft);

  const get = (key: TextKey) =>
    key.startsWith('title')
      ? draft.title[key === 'titleEn' ? 'en' : 'so']
      : draft.body[key === 'bodyEn' ? 'en' : 'so'];
  const set = (key: TextKey, value: string) =>
    setDraft((d) =>
      key.startsWith('title')
        ? { ...d, title: { ...d.title, [key === 'titleEn' ? 'en' : 'so']: value } }
        : { ...d, body: { ...d.body, [key === 'bodyEn' ? 'en' : 'so']: value } },
    );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (problem) {
      setMessage({ kind: 'alert', text: t(`admin.announce.${problem}`) });
      return;
    }
    setMessage(null);
    setConfirming(true);
  }

  async function send() {
    setBusy(true);
    try {
      const sent = await sendAnnouncement(request, cleanDraft(draft));
      setMessage({ kind: 'notice', text: t('admin.announce.sent', { count: sent.recipients }) });
      setDraft(EMPTY);
      history.reload();
      counts.reload();
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

  function textField(key: TextKey, multiline: boolean) {
    const max = multiline ? BODY_MAX : TITLE_MAX;
    const value = get(key);
    const id = `announce-${key}`;
    return (
      <div>
        <label className="field" htmlFor={id}>
          {t(`admin.announce.${key}`)}
        </label>
        {multiline ? (
          <textarea
            id={id}
            className="input textarea textarea-short"
            value={value}
            maxLength={max + 50}
            lang={key.endsWith('So') ? 'so' : 'en'}
            disabled={busy}
            onChange={(e) => set(key, e.target.value)}
          />
        ) : (
          <input
            id={id}
            className="input announce-input"
            value={value}
            maxLength={max + 20}
            lang={key.endsWith('So') ? 'so' : 'en'}
            disabled={busy}
            onChange={(e) => set(key, e.target.value)}
          />
        )}
        <p className={`field-hint ${value.trim().length > max ? 'text-danger' : 'muted'}`}>
          {t('admin.announce.count', { count: value.trim().length, max })}
        </p>
      </div>
    );
  }

  const items =
    history.state.status === 'ready' ? history.state.data.items : (history.previous?.items ?? null);

  return (
    <>
      <header className="page-header">
        <h1>{t('admin.announce.title')}</h1>
        <p className="muted">{t('admin.announce.subtitle')}</p>
      </header>

      {message ? (
        <p className={message.kind} role={message.kind === 'alert' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}

      <section className="card">
        <h2 className="section-title section-title-first">{t('admin.announce.newTitle')}</h2>
        <form onSubmit={submit} noValidate>
          <div className="announce-grid">
            {textField('titleEn', false)}
            {textField('titleSo', false)}
            {textField('bodyEn', true)}
            {textField('bodySo', true)}
          </div>
          <label className="select-field">
            <span>{t('admin.announce.audience')}</span>
            <select
              value={draft.audience}
              disabled={busy}
              onChange={(e) => setDraft((d) => ({ ...d, audience: e.target.value as Audience }))}
            >
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {t(`admin.announce.audiences.${a}`, { count: countOf(a) })}
                </option>
              ))}
            </select>
          </label>
          <label className="check announce-push">
            <input
              type="checkbox"
              checked={draft.push}
              disabled={busy}
              onChange={(e) => setDraft((d) => ({ ...d, push: e.target.checked }))}
            />
            {t('admin.announce.push')}
          </label>
          <button type="submit" className="button-primary" disabled={busy}>
            {busy ? t('admin.announce.sending') : t('admin.announce.send')}
          </button>
        </form>
      </section>

      <h2 className="section-title">{t('admin.announce.historyTitle')}</h2>
      {history.state.status === 'error' ? (
        <div className="alert alert-row" role="alert">
          <span>{t('admin.announce.error')}</span>
          <button type="button" className="button-secondary" onClick={history.reload}>
            {t('admin.announce.retry')}
          </button>
        </div>
      ) : (
        <div className="table-card" aria-busy={history.state.status === 'loading'}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('admin.announce.columns.when')}</th>
                <th scope="col">{t('admin.announce.columns.title')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.announce.columns.audience')}
                </th>
                <th scope="col">{t('admin.announce.columns.recipients')}</th>
                <th scope="col">{t('admin.announce.columns.read')}</th>
                <th scope="col" className="col-optional">
                  {t('admin.announce.columns.push')}
                </th>
                <th scope="col" className="col-optional">
                  {t('admin.announce.columns.by')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    {t('admin.announce.empty')}
                  </td>
                </tr>
              ) : null}
              {(items ?? []).map((a) => (
                <tr key={a.id}>
                  <td>{formatDate(a.createdAt, i18n.language, true)}</td>
                  <td className="cell-wrap">
                    {a.title[i18n.language === 'so' ? 'so' : 'en']}
                    <span className="cell-note muted">
                      {a.body[i18n.language === 'so' ? 'so' : 'en']}
                    </span>
                  </td>
                  <td className="col-optional">
                    {t(`admin.announce.audienceShort.${a.audience}`)}
                  </td>
                  <td>{a.recipients}</td>
                  <td>{a.read}</td>
                  <td className="col-optional">
                    {a.push
                      ? t('admin.announce.pushYes', { count: a.pushed })
                      : t('admin.announce.pushNo')}
                  </td>
                  <td className="col-optional cell-wrap">{a.createdBy ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        message={t('admin.announce.confirm', {
          title: draft.title[i18n.language === 'so' ? 'so' : 'en'].trim(),
          count: countOf(draft.audience),
        })}
        confirmLabel={t('admin.announce.confirmYes')}
        cancelLabel={t('admin.announce.cancel')}
        busy={busy}
        onConfirm={() => void send()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
