import type en from '@kobaniq/shared/i18n/en.json';

export type NavKey = keyof (typeof en)['admin']['nav']['items'];

export interface NavItem {
  key: NavKey;
  path: string;
  /** False until the page is built (shown with a "Soon" tag). */
  available: boolean;
}

/** Sidebar order follows the admin areas in Notion "KOBANIQ" → Admin dashboard. */
export const NAV_ITEMS: NavItem[] = [
  { key: 'overview', path: '/', available: true },
  { key: 'users', path: '/users', available: true },
  { key: 'skills', path: '/skills', available: false },
  { key: 'cvs', path: '/cvs', available: false },
  { key: 'jobs', path: '/jobs', available: false },
  { key: 'sources', path: '/job-sources', available: true },
  { key: 'runs', path: '/research-runs', available: false },
  { key: 'interviews', path: '/interviews', available: false },
  { key: 'usage', path: '/usage', available: false },
  { key: 'notifications', path: '/notifications', available: false },
  { key: 'reports', path: '/reports', available: false },
  { key: 'audit', path: '/audit-log', available: true },
];
