import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useAuth } from '../../auth/authContext';
import { en } from '../../i18n/en';
import { Sidebar } from './Sidebar';

/** Sidebar + top bar (signed-in admin, log out) around every admin page. */
export function AdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function onLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="shell">
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      {menuOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label={en.shell.closeMenu}
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div className="shell-main">
        <header className="topbar">
          <button
            type="button"
            className="menu-button"
            aria-label={menuOpen ? en.shell.closeMenu : en.shell.openMenu}
            aria-expanded={menuOpen}
            aria-controls="admin-sidebar"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M3 5h14M3 10h14M3 15h14"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
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
    </div>
  );
}
