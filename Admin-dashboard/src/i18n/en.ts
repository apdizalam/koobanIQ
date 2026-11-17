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
    subtitle: 'Live numbers from the database.',
    lastWeek: 'last 7 days',
    updatedAt: 'Updated',
    cards: {
      totalUsers: 'Total users',
      newUsers: 'New users',
      activeUsers: 'Active users',
      admins: 'Admins',
      suspended: 'Suspended accounts',
      languages: 'App language',
    },
    languageSplit: (en: number, so: number) => `English ${en} · Somali ${so}`,
    empty: 'No users yet. Numbers appear here as soon as people sign up.',
    error: 'Could not load the numbers. Check that the backend is running.',
    retry: 'Try again',
    soonTitle: 'Coming with later tasks',
    soon: {
      assessments: { label: 'Assessments', note: 'Counted once assessments exist (TIQ-13).' },
      cvs: { label: 'CVs', note: 'Counted once CV generation exists (TIQ-9).' },
      runs: { label: 'Research runs', note: 'Counted once job research runs exist (TIQ-16).' },
      failedJobs: { label: 'Failed jobs', note: 'Counted once background jobs exist (TIQ-16).' },
      aiUsage: { label: 'AI usage', note: 'Counted once usage tracking exists (TIQ-23).' },
    },
  },
  loading: 'Loading…',
} as const;
