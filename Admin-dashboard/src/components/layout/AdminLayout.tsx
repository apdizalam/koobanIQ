import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useNavigate } from 'react-router';
import { useAuth } from '../../auth/authContext';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Sidebar } from './Sidebar';

/** Sidebar + top bar (light/dark, language, signed-in admin, log out) around every admin page. */
export function AdminLayout() {
  const { t } = useTranslation();
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
          aria-label={t('admin.shell.closeMenu')}
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div className="shell-main">
        <header className="topbar">
          <button
            type="button"
            className="menu-button"
            aria-label={menuOpen ? t('admin.shell.closeMenu') : t('admin.shell.openMenu')}
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
            <ThemeToggle />
            <LanguageSwitcher />
            <span className="muted topbar-email">
              {t('admin.shell.signedInAs')} <strong>{user?.email}</strong>
            </span>
            <button type="button" className="button-secondary" onClick={onLogout}>
              {t('admin.shell.logout')}
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
