import { useSyncExternalStore } from 'react';
import { currentTheme, setTheme, type Theme } from '../theme';

/** Re-renders when <html data-theme> changes (this button, or the device setting). */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/**
 * One small button: "Dark mode", pressed when the dark theme is on. Both icons
 * are in the page; CSS shows the one for the theme on screen (the moon in light
 * mode, the sun in dark mode), so the pre-rendered HTML never shows the wrong one.
 */
export function ThemeToggle({ label }: { label: string }) {
  // The real theme is only known in the browser (after theme-init.js): null when pre-rendering.
  const theme = useSyncExternalStore<Theme | null>(
    subscribe,
    () => currentTheme(),
    () => null,
  );

  function toggle() {
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      aria-pressed={theme === null ? undefined : theme === 'dark'}
      onClick={toggle}
    >
      <svg
        className="theme-icon theme-icon-moon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
      <svg
        className="theme-icon theme-icon-sun"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
