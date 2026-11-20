import type { Types } from 'mongoose';
import { periodRange, type ReportPeriod } from '../lib/zonedTime.js';
import { Assessment } from '../models/Assessment.js';
import { Cv } from '../models/Cv.js';
import { Interview } from '../models/Interview.js';
import { JobDescription } from '../models/JobDescription.js';
import { JobMatch } from '../models/JobMatch.js';
import { ResearchRun } from '../models/ResearchRun.js';
import { SavedJob } from '../models/SavedJob.js';

/** One average: null when there is nothing to average (never 0 for "no data"). */
const average = (values: number[]) =>
  values.length === 0
    ? null
    : Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;

/**
 * The user's numbers for [start, end): every one a direct count of stored
 * records (or a plain average of stored values) — never estimated, never
 * written by the AI (TIQ-20 End Test).
 */
export async function countPeriod(userId: Types.ObjectId, start: Date, end: Date) {
  const range = { $gte: start, $lt: end };
  const [
    quizzes,
    interviews,
    answeredInterviews,
    cvsCreated,
    cvsApproved,
    cvsExported,
    jobAds,
    runs,
    savedJobs,
    scored,
    recommended,
  ] = await Promise.all([
    Assessment.find({ userId, status: 'finished', finishedAt: range }, { result: 1 }).lean(),
    Interview.countDocuments({ userId, status: 'finished', finishedAt: range }),
    // Practice answers given in the period (any session), with their feedback scores.
    Interview.aggregate<{ score: number }>([
      { $match: { userId, 'answers.answeredAt': range } },
      { $unwind: '$answers' },
      { $match: { 'answers.answeredAt': range } },
      { $project: { _id: 0, score: '$answers.feedback.score' } },
    ]),
    Cv.countDocuments({ userId, createdAt: range }),
    Cv.countDocuments({ userId, approvedAt: range }),
    Cv.countDocuments({ userId, exportedAt: range }),
    JobDescription.countDocuments({ userId, createdAt: range }),
    ResearchRun.find({ userId, startedAt: range }, { jobsFound: 1 }).lean(),
    SavedJob.countDocuments({ userId, createdAt: range }),
    JobMatch.countDocuments({ userId, computedAt: range }),
    JobMatch.countDocuments({ userId, computedAt: range, recommended: true }),
  ]);

  const quizScores = quizzes
    .map((q) => (q.result as { scorePercent?: number } | null)?.scorePercent)
    .filter((v): v is number => typeof v === 'number');

  return {
    quizzes: { finished: quizzes.length, averageScorePercent: average(quizScores) },
    interviews: {
      finished: interviews,
      answers: answeredInterviews.length,
      averageScore: average(answeredInterviews.map((a) => a.score)),
    },
    cvs: { created: cvsCreated, approved: cvsApproved, exported: cvsExported },
    jobs: {
      jobAdsSaved: jobAds,
      searches: runs.length,
      jobsFound: runs.reduce((sum, r) => sum + (r.jobsFound ?? 0), 0),
      saved: savedJobs,
      // Jobs scored for the user in the period (a job scored again counts once: one match per job).
      scored,
      recommended,
    },
  };
}

export type PeriodCounts = Awaited<ReturnType<typeof countPeriod>>;

/**
 * GET /reports?period&tz (TIQ-20): this period and the one before, cut at the
 * user's local boundaries. Applications are not tracked (users apply on the
 * employer's or source's own site), so there is no applications number.
 */
export async function getReport(
  userId: Types.ObjectId,
  period: ReportPeriod,
  timeZone: string,
  now = new Date(),
) {
  const range = periodRange(period, timeZone, now);
  // The current period only up to now (the future holds nothing yet).
  const [current, previous] = await Promise.all([
    countPeriod(userId, range.start, range.end),
    countPeriod(userId, range.previous.start, range.previous.end),
  ]);
  return {
    period,
    timeZone,
    generatedAt: now.toISOString(),
    current: { start: range.start.toISOString(), end: range.end.toISOString(), ...current },
    previous: {
      start: range.previous.start.toISOString(),
      end: range.previous.end.toISOString(),
      ...previous,
    },
  };
}
