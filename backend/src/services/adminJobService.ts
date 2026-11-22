import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { JOB_REMOVE_REASONS, Job, type JobRemoveReason } from '../models/Job.js';
import { JobMatch } from '../models/JobMatch.js';
import { SavedJob } from '../models/SavedJob.js';
import { User } from '../models/User.js';
import { recordAudit } from './auditService.js';

/** active: users can see it; expired: deadline passed; removed: an admin took it out. */
export const JOB_STATES = ['active', 'expired', 'removed'] as const;
export type JobState = (typeof JOB_STATES)[number];
export const isJobState = (v: unknown): v is JobState =>
  (JOB_STATES as readonly unknown[]).includes(v);
export const isRemoveReason = (v: unknown): v is JobRemoveReason =>
  (JOB_REMOVE_REASONS as readonly unknown[]).includes(v);

/** Most matches shown on a job's detail page. */
const MATCHES_SHOWN = 50;

const toId = (id: unknown) =>
  typeof id === 'string' && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const startOfToday = () => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
};

/** The same "still open" rule users get (jobMatchService.stillOpen). */
function stateFilter(state: JobState): Record<string, unknown> {
  const today = startOfToday();
  if (state === 'removed') return { removedAt: { $ne: null } };
  if (state === 'expired') return { removedAt: null, deadline: { $lt: today } };
  return {
    removedAt: null,
    $or: [{ deadline: null }, { deadline: { $exists: false } }, { deadline: { $gte: today } }],
  };
}

function stateOf(job: { removedAt?: Date | null; deadline?: Date | null }): JobState {
  if (job.removedAt) return 'removed';
  if (job.deadline && job.deadline < startOfToday()) return 'expired';
  return 'active';
}

/**
 * GET /admin/jobs (TIQ-33): every stored job, newest first, with its state,
 * sources, deadline, and how many users it was matched for / saved by.
 * Filters: state, source, and text in the title or employer.
 */
export async function listJobs(query: {
  state?: JobState;
  source?: string;
  q?: string;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = query.state ? stateFilter(query.state) : {};
  if (query.source) filter['sources.sourceKey'] = query.source;
  if (query.q?.trim()) {
    const re = { $regex: escapeRegex(query.q.trim().slice(0, 80)), $options: 'i' };
    filter.$and = [{ $or: [{ title: re }, { employer: re }] }];
  }
  const [docs, total, active, expired, removed, bySource] = await Promise.all([
    Job.find(filter, { description: 0 })
      .sort({ firstSeenAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Job.countDocuments(filter),
    Job.countDocuments(stateFilter('active')),
    Job.countDocuments(stateFilter('expired')),
    Job.countDocuments(stateFilter('removed')),
    Job.aggregate<{ _id: string; n: number }>([
      { $match: stateFilter('active') },
      { $unwind: '$sources' },
      { $group: { _id: '$sources.sourceKey', n: { $sum: 1 } } },
      { $sort: { n: -1 } },
    ]),
  ]);
  const ids = docs.map((d) => d._id);
  const [matches, saves] = await Promise.all([
    JobMatch.aggregate<{ _id: unknown; n: number; strong: number }>([
      { $match: { jobId: { $in: ids } } },
      {
        $group: {
          _id: '$jobId',
          n: { $sum: 1 },
          strong: { $sum: { $cond: [{ $eq: ['$category', 'strong'] }, 1, 0] } },
        },
      },
    ]),
    SavedJob.aggregate<{ _id: unknown; n: number }>([
      { $match: { jobId: { $in: ids } } },
      { $group: { _id: '$jobId', n: { $sum: 1 } } },
    ]),
  ]);
  const matchOf = new Map(matches.map((m) => [String(m._id), m]));
  const saveOf = new Map(saves.map((s) => [String(s._id), s.n]));
  return {
    summary: {
      active,
      expired,
      removed,
      bySource: bySource.map((s) => ({ sourceKey: s._id, active: s.n })),
    },
    items: docs.map((d) => ({
      id: String(d._id),
      title: d.title,
      employer: d.employer,
      region: d.region,
      city: d.city ?? null,
      sourceKeys: [...new Set((d.sources ?? []).map((s) => s.sourceKey))],
      applyUrl: d.applyUrl,
      deadline: d.deadline ?? null,
      firstSeenAt: d.firstSeenAt,
      lastSeenAt: d.lastSeenAt,
      state: stateOf(d),
      removedReason: d.removedReason ?? null,
      matches: matchOf.get(String(d._id))?.n ?? 0,
      strongMatches: matchOf.get(String(d._id))?.strong ?? 0,
      saved: saveOf.get(String(d._id)) ?? 0,
    })),
    total,
    page: query.page,
    limit: query.limit,
  };
}

async function findJob(id: unknown) {
  const jobId = toId(id);
  const job = jobId ? await Job.findById(jobId) : null;
  if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'Job not found');
  return job;
}

/**
 * GET /admin/jobs/:id: the job and how it matched users (the explanation:
 * score, category, level fit, skills it found and missing), best first.
 */
export async function getJobDetail(id: unknown) {
  const job = await findJob(id);
  const [matches, saved] = await Promise.all([
    JobMatch.find({ jobId: job._id }).sort({ score: -1 }).limit(MATCHES_SHOWN).lean(),
    SavedJob.countDocuments({ jobId: job._id }),
  ]);
  const ids = [...matches.map((m) => m.userId), ...(job.removedBy ? [job.removedBy] : [])];
  const users = await User.find({ _id: { $in: ids } }, { email: 1 }).lean();
  const emailOf = new Map(users.map((u) => [String(u._id), u.email]));
  return {
    job: {
      id: String(job._id),
      title: job.title,
      employer: job.employer,
      employerType: job.employerType,
      region: job.region,
      city: job.city ?? null,
      sourceKeys: [...new Set(job.sources.map((s) => s.sourceKey))],
      applyUrl: job.applyUrl,
      deadline: job.deadline ?? null,
      postedAt: job.postedAt ?? null,
      firstSeenAt: job.firstSeenAt,
      lastSeenAt: job.lastSeenAt,
      state: stateOf(job),
      removedAt: job.removedAt ?? null,
      removedReason: job.removedReason ?? null,
      removedBy: job.removedBy ? (emailOf.get(String(job.removedBy)) ?? null) : null,
      saved,
      matches: matches.map((m) => ({
        userId: String(m.userId),
        email: emailOf.get(String(m.userId)) ?? null,
        score: m.score,
        category: m.category,
        recommended: m.recommended,
        levelFit: m.levelFit,
        userLevel: m.userLevel ?? null,
        jobLevel: m.jobLevel ?? null,
        matchedSkills: m.matchedSkills,
        missingRequired: m.missingRequired,
        computedAt: m.computedAt,
      })),
    },
  };
}

/**
 * POST /admin/jobs/:id/remove { reason }: takes the job out for every user
 * (search, run results, saved jobs, alerts). Kept in the database (restorable);
 * finding it again does not bring it back. Audited.
 */
export async function removeJob(req: Request, id: unknown, reason: unknown) {
  if (!isRemoveReason(reason)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      reason: 'choiceInvalid',
    });
  }
  const job = await findJob(id);
  if (!job.removedAt) {
    job.removedAt = new Date();
    job.removedReason = reason;
    job.removedBy = req.user!._id;
    await job.save();
    await recordAudit(req, {
      action: 'job.remove',
      targetType: 'job',
      targetId: String(job._id),
      before: { title: job.title, removed: false },
      after: { title: job.title, removed: true, reason },
    });
  }
  return getJobDetail(String(job._id));
}

/** POST /admin/jobs/:id/restore: users see the job again. Audited. */
export async function restoreJob(req: Request, id: unknown) {
  const job = await findJob(id);
  if (job.removedAt) {
    const reason = job.removedReason;
    job.removedAt = null;
    job.removedReason = null;
    job.removedBy = null;
    await job.save();
    await recordAudit(req, {
      action: 'job.restore',
      targetType: 'job',
      targetId: String(job._id),
      before: { title: job.title, removed: true, reason },
      after: { title: job.title, removed: false },
    });
  }
  return getJobDetail(String(job._id));
}

/**
 * POST /admin/jobs/remove-expired: removes every job whose deadline has passed
 * (reason "expired"), in one go. Audited with the count.
 */
export async function removeExpiredJobs(req: Request) {
  const res = await Job.updateMany(stateFilter('expired'), {
    $set: { removedAt: new Date(), removedReason: 'expired', removedBy: req.user!._id },
  });
  if (res.modifiedCount > 0) {
    await recordAudit(req, {
      action: 'job.remove_expired',
      targetType: 'job',
      after: { removed: res.modifiedCount },
    });
  }
  return { removed: res.modifiedCount };
}
