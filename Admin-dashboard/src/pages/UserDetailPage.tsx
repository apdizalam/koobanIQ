import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useAuth } from '../auth/authContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ReasonDialog } from '../components/ui/ReasonDialog';
import { useUser } from '../hooks/useUsers';
import { availableActions, runUserAction } from '../services/adminUsersApi';
import { ApiError } from '../services/api';
import { updateTestAccount } from '../services/privacyApi';
import type { UserAction } from '../types/adminUsers';
import { formatDate } from '../utils/format';

/**
 * Admin → Users → one user: details plus suspend / reactivate / role / delete,
 * and the test-account mark (with a reason, audited).
 */
export function UserDetailPage() {
  const { t, i18n } = useTranslation();
  const id = useParams().id ?? '';
  const { user: me, request } = useAuth();
  const navigate = useNavigate();
  const { state, reload, previous } = useUser(id);
  const [pending, setPending] = useState<UserAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'notice' | 'alert'; text: string } | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  // After an action the page reloads; meanwhile it keeps showing the previous details.
  const user = state.status === 'ready' ? state.data.user : (previous?.user ?? null);

  async function confirm() {
    if (!user || !pending) return;
    setBusy(true);
    const done = t(`admin.users.done.${pending}`, { email: user.email });
    try {
      await runUserAction(request, user.id, pending);
      if (pending === 'delete') {
        navigate('/users', { replace: true, state: { flash: done } });
        return;
      }
      setMessage({ kind: 'notice', text: done });
      reload();
    } catch (err) {
      // The server already answers in the admin's language (TIQ-30 slice 4).
      setMessage({
        kind: 'alert',
        text: err instanceof ApiError ? err.message : t('admin.errors.generic'),
      });
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  async function saveTestAccount(reason: string) {
    if (!user) return;
    const testAccount = !user.testAccount;
    setBusy(true);
    setTestError(null);
    try {
      const updated = await updateTestAccount(request, user.id, testAccount, reason);
      setTestOpen(false);
      setMessage({
        kind: 'notice',
        text: t(updated.testAccount ? 'admin.users.testOn' : 'admin.users.testOff', {
          email: updated.email,
        }),
      });
      reload();
    } catch (err) {
      setTestError(err instanceof ApiError ? err.message : t('admin.errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p>
        <Link to="/users" className="table-link">
          ← {t('admin.users.back')}
        </Link>
      </p>

      {state.status === 'loading' && !user ? (
        <p className="muted" role="status">
          {t('common.loading')}
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p className="alert" role="alert">
          {t('admin.users.notFound')}
        </p>
      ) : null}

      {user ? (
        <>
          <header className="page-header">
            <h1 className="break-anywhere">{user.email}</h1>
            <p>
              <span className={`badge badge-${user.role}`}>
                {t(`admin.users.roles.${user.role}`)}
              </span>{' '}
              <span className={`badge badge-${user.status}`}>
                {t(`admin.users.statuses.${user.status}`)}
              </span>
              {user.testAccount ? (
                <>
                  {' '}
                  <span className="badge badge-test">{t('admin.users.testAccount')}</span>
                </>
              ) : null}
            </p>
          </header>

          {message ? (
            <p className={message.kind} role={message.kind === 'alert' ? 'alert' : 'status'}>
              {message.text}
            </p>
          ) : null}

          <section className="card">
            <dl className="details">
              <dt>{t('admin.users.columns.language')}</dt>
              <dd>{t(`common.language.${user.preferredLanguage}`)}</dd>
              <dt>{t('admin.users.emailVerified')}</dt>
              <dd>{user.emailVerified ? t('admin.users.yes') : t('admin.users.no')}</dd>
              <dt>{t('admin.users.sessions')}</dt>
              <dd>{user.activeSessions}</dd>
              <dt>{t('admin.users.columns.lastActive')}</dt>
              <dd>
                {user.lastActiveAt
                  ? formatDate(user.lastActiveAt, i18n.language, true)
                  : t('admin.users.never')}
              </dd>
              <dt>{t('admin.users.columns.joined')}</dt>
              <dd>{formatDate(user.createdAt, i18n.language, true)}</dd>
            </dl>
          </section>

          <section className="card">
            <h2 className="section-title">{t('admin.users.testAccount')}</h2>
            <p className="muted">{t('admin.users.testAccountHint')}</p>
            <p>
              {t('admin.users.testAccount')}:{' '}
              <strong>{user.testAccount ? t('admin.users.yes') : t('admin.users.no')}</strong>
            </p>
            <div className="action-row">
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setMessage(null);
                  setTestError(null);
                  setTestOpen(true);
                }}
              >
                {user.testAccount ? t('admin.users.unmarkTest') : t('admin.users.markTest')}
              </button>
            </div>
          </section>

          <section className="card">
            <h2 className="section-title">{t('admin.users.actions.title')}</h2>
            {user.id === me?.id ? (
              <p className="muted">{t('admin.users.you')}</p>
            ) : (
              <div className="action-row">
                {availableActions(user, me?.id).map((action) => (
                  <button
                    key={action}
                    type="button"
                    className={action === 'delete' ? 'button-danger' : 'button-secondary'}
                    onClick={() => {
                      setMessage(null);
                      setPending(action);
                    }}
                  >
                    {t(`admin.users.actions.${action}`)}
                  </button>
                ))}
              </div>
            )}
          </section>

          <ConfirmDialog
            open={pending !== null}
            message={pending ? t(`admin.users.confirm.${pending}`, { email: user.email }) : ''}
            confirmLabel={t('admin.users.confirm.yes')}
            cancelLabel={t('admin.users.confirm.cancel')}
            danger={pending === 'delete' || pending === 'suspend'}
            busy={busy}
            onConfirm={() => void confirm()}
            onCancel={() => setPending(null)}
          />

          <ReasonDialog
            open={testOpen}
            title={user.testAccount ? t('admin.users.unmarkTest') : t('admin.users.markTest')}
            message={t(
              user.testAccount ? 'admin.users.testDialogOff' : 'admin.users.testDialogOn',
              {
                email: user.email,
              },
            )}
            saveLabel={t('admin.privacy.save')}
            busy={busy}
            error={testError}
            onSave={(reason) => void saveTestAccount(reason)}
            onCancel={() => setTestOpen(false)}
          />
        </>
      ) : null}
    </>
  );
}
