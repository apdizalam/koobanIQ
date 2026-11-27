/*
 * KOBANIQ theme, set before the page is drawn (no flash of the wrong theme).
 * Loaded as a file because the site's Content-Security-Policy allows no inline
 * scripts. The visitor's choice ("light" / "dark") is kept in localStorage under
 * "kobaniq-theme" — shared by the landing page and the admin dashboard (same
 * site). Without a choice, the phone's or computer's setting is followed.
 * Keep in sync with landing/public/theme-init.js and src/theme.ts.
 */
(function () {
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function saved() {
    try {
      var value = window.localStorage.getItem('kobaniq-theme');
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }
  function apply() {
    root.setAttribute('data-theme', saved() || (media && media.matches ? 'dark' : 'light'));
  }
  apply();
  // No choice yet: follow the device when its setting changes.
  if (media && media.addEventListener) {
    media.addEventListener('change', function () {
      if (!saved()) apply();
    });
  }
})();
