import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { currentTheme, setTheme } from '../../theme';

/** Re-renders when <html data-theme> changes (this button, or the device setting). */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/**
 * Light / dark switch next to the language switch: one small button, "Dark
 * mode", pressed while the dark theme is on. Shows a moon in light mode and a
 * sun in dark mode. The choice stays in this browser (src/theme.ts).
 */
export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useSyncExternalStore(
    subscribe,
    () => currentTheme(),
    () => currentTheme(),
  );

  function toggle() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={t('admin.shell.darkMode')}
      title={t('admin.shell.darkMode')}
      aria-pressed={theme === 'dark'}
      onClick={toggle}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        )}
      </svg>
    </button>
  );
}
