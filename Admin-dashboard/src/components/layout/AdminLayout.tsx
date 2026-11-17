import { Outlet, useNavigate } from 'react-router';
import { useAuth } from '../../auth/authContext';
import { en } from '../../i18n/en';

/** Top bar (app name, signed-in admin, log out) around every admin page. */
export function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">{en.appName}</span>
        <div className="topbar-user">
          <span className="muted">
            {en.shell.signedInAs} <strong>{user?.email}</strong>
          </span>
          <button type="button" className="button-secondary" onClick={onLogout}>
            {en.shell.logout}
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
