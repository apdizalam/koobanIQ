import { User } from '../models/User.js';

export const PERIODS = ['day', 'week', 'month', 'year'] as const;
export type Period = (typeof PERIODS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30, year: 365 };

export const isPeriod = (value: unknown): value is Period =>
  typeof value === 'string' && (PERIODS as readonly string[]).includes(value);

/**
 * Admin Overview numbers, counted straight from the database.
 * Only collections that exist today are counted; assessments, CVs, research
 * runs, failed jobs and AI usage are added when their tasks are built.
 */
export async function getOverview(period: Period = 'week', now = new Date()) {
  const since = new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS);

  const [total, admins, suspended, created, active, en, so] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'admin' }),
    User.countDocuments({ status: 'suspended' }),
    User.countDocuments({ createdAt: { $gte: since } }),
    User.countDocuments({ lastActiveAt: { $gte: since } }),
    User.countDocuments({ preferredLanguage: 'en' }),
    User.countDocuments({ preferredLanguage: 'so' }),
  ]);

  return {
    period,
    since: since.toISOString(),
    generatedAt: now.toISOString(),
    users: { total, admins, suspended, new: created, active },
    languages: { en, so },
  };
}
