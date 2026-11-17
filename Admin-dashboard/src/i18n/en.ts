/**
 * All admin screen text in one place, so it can move to the shared
 * en.json / so.json files when i18n lands (TIQ-30).
 */
export const en = {
  appName: 'KOBANIQ Admin',
  login: {
    title: 'Sign in',
    subtitle: 'Admin dashboard',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in…',
  },
  errors: {
    invalidCredentials: 'Email or password is incorrect.',
    noAccess: 'No access. This account is not an admin, so you have been signed out.',
    suspended: 'This account is suspended.',
    network: 'Cannot reach the server. Is the backend running?',
    generic: 'Something went wrong. Please try again.',
    required: 'Enter your email and password.',
  },
  shell: {
    signedInAs: 'Signed in as',
    logout: 'Log out',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },
  nav: {
    label: 'Admin sections',
    soon: 'Soon',
    items: {
      overview: 'Overview',
      users: 'Users',
      skills: 'Skills & assessments',
      cvs: 'CVs',
      jobs: 'Jobs & matching',
      sources: 'Job sources',
      runs: 'Research runs',
      interviews: 'Interviews',
      usage: 'Usage',
      notifications: 'Notifications',
      reports: 'Reports',
      audit: 'Audit log',
    },
  },
  overview: {
    title: 'Overview',
    comingSoon: 'Live counts are coming next in this task (TIQ-24).',
    serverCheck: {
      checking: 'Checking admin access with the server…',
      ok: 'Admin access confirmed by the server.',
      failed: 'Could not confirm admin access with the server.',
    },
  },
  loading: 'Loading…',
} as const;
