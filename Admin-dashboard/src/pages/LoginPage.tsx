import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/authContext';
import { en } from '../i18n/en';
import { ApiError } from '../services/api';

/** Turns an API error into the sentence shown under the form. */
function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return en.errors.generic;
  switch (err.code) {
    case 'INVALID_CREDENTIALS':
      return en.errors.invalidCredentials;
    case 'NO_ACCESS':
      return en.errors.noAccess;
    case 'ACCOUNT_SUSPENDED':
      return en.errors.suspended;
    case 'NETWORK_ERROR':
      return en.errors.network;
    case 'VALIDATION_ERROR':
      return en.errors.required;
    default:
      return en.errors.generic;
  }
}

export function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError(en.errors.required);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="card login-card" onSubmit={onSubmit} noValidate>
        <p className="brand">{en.appName}</p>
        <h1>{en.login.title}</h1>
        <p className="muted">{en.login.subtitle}</p>

        <label className="field">
          <span>{en.login.email}</span>
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
          <span>{en.login.password}</span>
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
            {error}
          </p>
        ) : null}

        <button type="submit" className="button-primary" disabled={busy}>
          {busy ? en.login.submitting : en.login.submit}
        </button>
      </form>
    </main>
  );
}
