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
  { key: 'overview', path: '/overview', available: true },
  { key: 'users', path: '/users', available: true },
  { key: 'waitlist', path: '/waitlist', available: true },
  { key: 'skills', path: '/skills', available: true },
  { key: 'cvs', path: '/cvs', available: true },
  { key: 'jobs', path: '/jobs', available: true },
  { key: 'sources', path: '/job-sources', available: true },
  { key: 'runs', path: '/research-runs', available: true },
  { key: 'interviews', path: '/interviews', available: true },
  { key: 'usage', path: '/usage', available: true },
  { key: 'notifications', path: '/notifications', available: true },
  { key: 'reports', path: '/reports', available: true },
  { key: 'privacy', path: '/ai-privacy', available: true },
  { key: 'audit', path: '/audit-log', available: true },
];
