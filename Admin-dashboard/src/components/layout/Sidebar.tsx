import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { NAV_ITEMS } from '../../constants/navigation';

interface SidebarProps {
  /** On small screens the sidebar slides in; `open` controls it there. */
  open: boolean;
  onNavigate: () => void;
}

/** Left navigation with every admin section; unbuilt sections are shown but disabled. */
export function Sidebar({ open, onNavigate }: SidebarProps) {
  const { t } = useTranslation();
  return (
    <aside className={`sidebar${open ? ' sidebar-open' : ''}`} id="admin-sidebar">
      <p className="brand sidebar-brand">{t('admin.appName')}</p>
      <nav aria-label={t('admin.nav.label')}>
        <ul className="nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.key}>
              {item.available ? (
                <NavLink
                  to={item.path}
                  end
                  onClick={onNavigate}
                  className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
                >
                  {t(`admin.nav.items.${item.key}`)}
                </NavLink>
              ) : (
                <span className="nav-link nav-link-disabled" aria-disabled="true">
                  {t(`admin.nav.items.${item.key}`)}
                  <span className="nav-soon">{t('admin.nav.soon')}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
