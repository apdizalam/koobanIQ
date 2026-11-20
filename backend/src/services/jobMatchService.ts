import type { Types } from 'mongoose';
import { matchJob, type JobMatchResult } from '../jobs/match/score.js';
import type { UserSignals } from '../jobs/match/signals.js';
import { AppError } from '../lib/errors.js';
import { isItemId } from '../lib/validateProfile.js';
import { Job, toPublicJob, type JobDocument } from '../models/Job.js';
import { JobMatch } from '../models/JobMatch.js';
import { Profile } from '../models/Profile.js';
import type { RegionKey } from '../models/Region.js';
import { SavedJob } from '../models/SavedJob.js';
import { Skill } from '../models/Skill.js';

/** Doc 9 §5: both regions by default; remote roles open to them come next. */
const DEFAULT_REGIONS: RegionKey[] = ['somaliland', 'somalia'];
/** Most stored jobs scored for one search (newest first). */
const CANDIDATES = 300;
/** Most jobs returned per section. */
const PAGE = 50;

/**
 * What the matcher may use: the user's own profile and skills only (never an
 * AI, so nothing personal leaves the server).
 */
export async function userSignals(userId: Types.ObjectId): Promise<UserSignals> {
  const [profile, skills] = await Promise.all([
    Profile.findOne({ userId }),
    Skill.find({ userId }),
  ]);
  const prefs = profile?.preferences;
  return {
    skills: skills.map((s) => ({
      name: s.name,
      selfLevel: s.selfLevel as UserSignals['skills'][number]['selfLevel'],
      assessedLevel: (s.assessedLevel ?? null) as UserSignals['skills'][number]['assessedLevel'],
    })),
    experience: (profile?.experience ?? []).map((e) => ({
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate ?? null,
      description: e.description ?? null,
    })),
    projectSkills: (profile?.projects ?? []).flatMap((p) => p.skills ?? []),
    certifications: (profile?.certifications ?? []).map((c) => c.name),
    headline: profile?.personal?.headline ?? null,
    preferences: {
      titles: prefs?.titles ?? [],
      regions: prefs?.regions ?? [],
      cities: prefs?.cities ?? [],
      employerTypes: prefs?.employerTypes ?? [],
      jobTypes: prefs?.jobTypes ?? [],
      workModes: prefs?.workModes ?? [],
    },
  };
}

const publicMatch = (m: JobMatchResult) => ({
  score: m.score,
  category: m.category,
  recommended: m.recommended,
  matchedSkills: m.matchedSkills,
  missingRequired: m.missingRequired,
  missingPreferred: m.missingPreferred,
  userLevel: m.userLevel,
  levelConfidence: m.levelConfidence,
  jobLevel: m.jobLevel,
  levelFit: m.levelFit,
  relevantYears: m.relevantYears,
  requiredYears: m.requiredYears,
  reasons: m.reasons,
});
export type PublicMatch = ReturnType<typeof publicMatch>;

/**
 * Scores the jobs for the user and stores every match with its explanation
 * (TIQ-17), then returns them best first, split into the main results and the
 * lower matches (never mixed: a job that does not fit is never "recommended").
 */
export async function matchJobs(userId: Types.ObjectId, jobs: JobDocument[], regions: string[]) {
  const signals = await userSignals(userId);
  const now = new Date();
  const scored = jobs.map((job) => ({
    job,
    match: matchJob(
      signals,
      {
        title: job.title,
        description: job.description,
        region: job.region,
        city: job.city,
        employerType: job.employerType,
        jobType: job.jobType,
      },
      { regions },
    ),
  }));
  if (scored.length > 0) {
    await JobMatch.bulkWrite(
      scored.map(({ job, match }) => ({
        updateOne: {
          filter: { userId, jobId: job._id },
          update: { $set: { ...match, computedAt: now } },
          upsert: true,
        },
      })),
    );
  }
  const byScore = (a: (typeof scored)[number], b: (typeof scored)[number]) =>
    b.match.score - a.match.score;
  const view = ({ job, match }: (typeof scored)[number]) => ({
    job: toPublicJob(job),
    match: publicMatch(match),
  });
  return {
    recommended: scored
      .filter((s) => s.match.recommended)
      .sort(byScore)
      .map(view),
    lowerMatch: scored
      .filter((s) => !s.match.recommended)
      .sort(byScore)
      .map(view),
  };
}

/** Jobs still open: no deadline given, or a deadline from today on. */
export const stillOpen = () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return {
    $or: [{ deadline: null }, { deadline: { $exists: false } }, { deadline: { $gte: today } }],
  };
};

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface StoredJobSearch {
  q?: string;
  regions?: RegionKey[];
  city?: string;
  employerTypes?: string[];
  jobTypes?: string[];
  /** Also return the lower matches (only when the user asks to see them). */
  includeLower: boolean;
}

/**
 * GET /jobs/search (method A, TIQ-17/18): searches the jobs KOBANIQ already
 * stored (found by earlier research), open ones only, with the filters, then
 * scores them for this user. Never adds or invents a job; an empty result says so.
 */
export async function searchStoredJobs(userId: Types.ObjectId, search: StoredJobSearch) {
  const signals = await userSignals(userId);
  const regions: RegionKey[] = search.regions?.length
    ? search.regions
    : signals.preferences.regions.length
      ? (signals.preferences.regions as RegionKey[])
      : DEFAULT_REGIONS;

  const filter: Record<string, unknown> = {
    region: { $in: [...new Set([...regions, 'remote'])] },
    ...stillOpen(),
  };
  if (search.city) filter.city = new RegExp(`^${escapeRe(search.city.trim())}$`, 'i');
  if (search.employerTypes?.length) filter.employerType = { $in: search.employerTypes };
  if (search.jobTypes?.length) filter.jobType = { $in: search.jobTypes };
  if (search.q?.trim()) {
    const re = new RegExp(escapeRe(search.q.trim()), 'i');
    filter.$and = [{ $or: [{ title: re }, { employer: re }, { description: re }] }];
  }
  const jobs = await Job.find(filter).sort({ lastSeenAt: -1 }).limit(CANDIDATES);
  const { recommended, lowerMatch } = await matchJobs(userId, jobs, regions);
  return {
    regions,
    searched: jobs.length,
    recommended: recommended.slice(0, PAGE),
    lowerMatch: search.includeLower ? lowerMatch.slice(0, PAGE) : [],
    counts: { recommended: recommended.length, lowerMatch: lowerMatch.length },
  };
}

// ------------------------------------------------------------------ saved jobs (TIQ-18)

async function existingJob(id: unknown) {
  const job = isItemId(id) ? await Job.findById(id) : null;
  if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Job not found');
  return job;
}

export async function saveJob(userId: Types.ObjectId, jobId: unknown) {
  const job = await existingJob(jobId);
  await SavedJob.updateOne(
    { userId, jobId: job._id },
    { $setOnInsert: { userId, jobId: job._id } },
    { upsert: true },
  );
}

export async function unsaveJob(userId: Types.ObjectId, jobId: unknown) {
  if (isItemId(jobId)) await SavedJob.deleteOne({ userId, jobId });
}

/** GET /jobs/saved: newest first, each with its current match for this user. */
export async function listSavedJobs(userId: Types.ObjectId) {
  const saved = await SavedJob.find({ userId }).sort({ createdAt: -1 }).limit(200);
  const jobs = await Job.find({ _id: { $in: saved.map((s) => s.jobId) } });
  const byId = new Map(jobs.map((j) => [String(j._id), j]));
  const ordered = saved.map((s) => byId.get(String(s.jobId))).filter((j) => j !== undefined);
  const { recommended, lowerMatch } = await matchJobs(userId, ordered, []);
  const all = new Map([...recommended, ...lowerMatch].map((r) => [r.job.id, r]));
  return ordered.map((j) => all.get(String(j._id))!);
}

/** GET /jobs/:id: the job, this user's match for it, and whether it is saved. */
export async function jobWithMatch(userId: Types.ObjectId, jobId: unknown) {
  const job = await existingJob(jobId);
  const { recommended, lowerMatch } = await matchJobs(userId, [job], []);
  const saved = await SavedJob.exists({ userId, jobId: job._id });
  return { ...(recommended[0] ?? lowerMatch[0]), saved: !!saved };
}

/** Deleting an account deletes its matches and saved jobs (jobs are shared and stay). */
export async function deleteJobData(userId: Types.ObjectId) {
  await Promise.all([JobMatch.deleteMany({ userId }), SavedJob.deleteMany({ userId })]);
}
