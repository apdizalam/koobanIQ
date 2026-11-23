import { Assessment } from '../models/Assessment.js';
import { Cv } from '../models/Cv.js';
import { ResearchRun } from '../models/ResearchRun.js';
import { User } from '../models/User.js';
import { Waitlist } from '../models/Waitlist.js';

export const PERIODS = ['day', 'week', 'month', 'year'] as const;
export type Period = (typeof PERIODS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30, year: 365 };

export const isPeriod = (value: unknown): value is Period =>
  typeof value === 'string' && (PERIODS as readonly string[]).includes(value);

/**
 * Admin Overview numbers, counted straight from the database: users, and the
 * activity in the period (finished skill quizzes, CVs created, job searches and
 * the ones that failed), plus the landing page waitlist (TIQ-35).
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

  const inPeriod = { $gte: since };
  const [quizzesFinished, cvsCreated, runs, runsFailed, waitlist] = await Promise.all([
    Assessment.countDocuments({ status: 'finished', finishedAt: inPeriod }),
    Cv.countDocuments({ createdAt: inPeriod }),
    ResearchRun.countDocuments({ createdAt: inPeriod }),
    ResearchRun.countDocuments({ createdAt: inPeriod, status: 'failed' }),
    Waitlist.countDocuments(),
  ]);

  return {
    period,
    since: since.toISOString(),
    generatedAt: now.toISOString(),
    users: { total, admins, suspended, new: created, active },
    languages: { en, so },
    activity: { quizzesFinished, cvsCreated, runs, runsFailed },
    waitlist,
  };
}
