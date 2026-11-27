import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/authContext';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { ApiError } from '../services/api';

type ErrorKey =
  'invalidCredentials' | 'noAccess' | 'suspended' | 'network' | 'required' | 'generic';

/** Which message to show under the form for an API error. */
function errorKey(err: unknown): ErrorKey {
  if (!(err instanceof ApiError)) return 'generic';
  switch (err.code) {
    case 'INVALID_CREDENTIALS':
      return 'invalidCredentials';
    case 'NO_ACCESS':
      return 'noAccess';
    case 'ACCOUNT_SUSPENDED':
      return 'suspended';
    case 'NETWORK_ERROR':
      return 'network';
    case 'VALIDATION_ERROR':
      return 'required';
    default:
      return 'generic';
  }
}

export function LoginPage() {
  const { t } = useTranslation();
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/overview';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Store the key, not the sentence, so the message follows a language switch.
  const [error, setError] = useState<ErrorKey | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError('required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorKey(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card login-card" onSubmit={onSubmit} noValidate>
        <div className="login-top">
          <p className="brand">{t('admin.appName')}</p>
          <div className="login-switches">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
        <h1>{t('admin.login.title')}</h1>
        <p className="muted">{t('admin.login.subtitle')}</p>

        <label className="field">
          <span>{t('admin.login.email')}</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            autoFocus
          />
        </label>

        <label className="field">
          <span>{t('admin.login.password')}</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </label>

        {error ? (
          <p className="alert" role="alert">
            {t(`admin.errors.${error}`)}
          </p>
        ) : null}

        <button type="submit" className="button-primary" disabled={busy}>
          {busy ? t('admin.login.submitting') : t('admin.login.submit')}
        </button>
      </form>
    </main>
  );
}
