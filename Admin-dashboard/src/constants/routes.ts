/**
 * The admin's place on the one KOBANIQ website: the landing page is the home
 * page (/) and every admin page is under /admin (vite.config.ts `base`).
 * BASE_URL is "/admin/" there; the router wants it without the last slash.
 */
export const ADMIN_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
