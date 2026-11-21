import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { RUN_STATUSES, ResearchRun, toPublicRun } from '../models/ResearchRun.js';
import { ResearchSchedule, toPublicSchedule } from '../models/ResearchSchedule.js';
import { User } from '../models/User.js';
import { recordAudit } from './auditService.js';
import { startResearch } from './researchService.js';
import { updateSchedule } from './scheduleService.js';

export type RunStatus = (typeof RUN_STATUSES)[number];
export const isRunStatus = (v: unknown): v is RunStatus =>
  (RUN_STATUSES as readonly unknown[]).includes(v);

/** Only a run that went wrong can be retried. */
const RETRYABLE: RunStatus[] = ['failed', 'partial'];

const toId = (id: unknown) =>
  typeof id === 'string' && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;

/** Emails of these users (deleted users are simply missing). */
async function emailsOf(ids: unknown[]) {
  const users = await User.find({ _id: { $in: ids } }, { email: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.email]));
}

type RunLike = {
  scheduleId?: unknown;
  retryOf?: unknown;
};

/** How the run started: by the user, by one of their schedules, or by an admin retry. */
const triggerOf = (run: RunLike) =>
  run.retryOf ? 'retry' : run.scheduleId ? 'scheduled' : ('manual' as const);

/**
 * GET /admin/research-runs (TIQ-33): every user's job searches, newest first,
 * with who ran it, how it started, the sources, results and errors.
 */
export async function listRuns(query: { status?: RunStatus; page: number; limit: number }) {
  const filter = query.status ? { status: query.status } : {};
  const [runs, total] = await Promise.all([
    ResearchRun.find(filter, { jobIds: 0 })
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    ResearchRun.countDocuments(filter),
  ]);
  const emails = await emailsOf(runs.map((r) => r.userId));
  const items = runs.map((run) => ({
    id: String(run._id),
    userId: String(run.userId),
    email: emails.get(String(run.userId)) ?? null,
    status: run.status,
    trigger: triggerOf(run),
    sourceKeys: run.sourceKeys,
    jobsFound: run.jobsFound ?? 0,
    jobsNew: run.jobsNew ?? 0,
    /** Sources that failed after their retries. */
    failedSources: (run.perSource ?? []).filter((p) => p.error).map((p) => p.key),
    error: run.error ?? null,
    retryOf: run.retryOf ? String(run.retryOf) : null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
  }));
  return { items, total, page: query.page, limit: query.limit };
}

async function findRun(id: unknown) {
  const runId = toId(id);
  const run = runId ? await ResearchRun.findById(runId) : null;
  if (!run) throw new AppError(404, 'RUN_NOT_FOUND', 'Job search not found');
  return run;
}

/** GET /admin/research-runs/:id: one run with every source's result and its retries. */
export async function getRunDetail(id: unknown) {
  const run = await findRun(id);
  const [emails, retries] = await Promise.all([
    emailsOf([run.userId]),
    ResearchRun.find({ retryOf: run._id }, { _id: 1, status: 1, startedAt: 1 })
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  return {
    run: {
      ...toPublicRun(run),
      userId: String(run.userId),
      email: emails.get(String(run.userId)) ?? null,
      trigger: triggerOf(run),
      retries: retries.map((r) => ({
        id: String(r._id),
        status: r.status,
        startedAt: r.startedAt,
      })),
    },
  };
}

/**
 * POST /admin/research-runs/:id/retry: runs a failed (or partly failed) search
 * again for the same user with the same sources, regions, filters and links.
 * It is a new run record (retryOf points at the old one); the old one stays as
 * it was. Audited.
 */
export async function retryRun(req: Request, id: unknown) {
  const run = await findRun(id);
  if (!RETRYABLE.includes(run.status as RunStatus)) {
    throw new AppError(409, 'RUN_NOT_RETRYABLE', 'Only a failed job search can be retried');
  }
  const user = await User.findById(run.userId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  if (user.status !== 'active') {
    throw new AppError(409, 'ACCOUNT_SUSPENDED', 'This account is suspended');
  }

  const filters = run.filters;
  const started = await startResearch(
    user._id,
    {
      sourceKeys: run.sourceKeys,
      regions: run.regions,
      filters: {
        titles: [...(filters?.titles ?? [])],
        skills: [...(filters?.skills ?? [])],
        ...(filters?.city ? { city: filters.city } : {}),
        employerTypes: [...(filters?.employerTypes ?? [])],
      },
      customUrls: [...run.customUrls],
    },
    { retryOf: run._id },
  );
  await recordAudit(req, {
    action: 'research_run.retry',
    targetType: 'user',
    targetId: String(user._id),
    before: { run: String(run._id), status: run.status },
    after: { run: started.id, status: started.status },
  });
  return { run: started };
}

/** GET /admin/research-schedules: every user's scheduled searches, newest first. */
export async function listAllSchedules(query: { page: number; limit: number }) {
  const [docs, total] = await Promise.all([
    ResearchSchedule.find()
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    ResearchSchedule.countDocuments(),
  ]);
  const emails = await emailsOf(docs.map((d) => d.userId));
  const items = docs.map((doc) => ({
    ...toPublicSchedule(doc),
    userId: String(doc.userId),
    email: emails.get(String(doc.userId)) ?? null,
  }));
  return { items, total, page: query.page, limit: query.limit };
}

/**
 * PATCH /admin/research-schedules/:id { enabled }: pause (no more runs) or
 * resume (next run from now). The user sees the same switch in the app.
 * Audited; no change, no record.
 */
export async function setScheduleEnabled(req: Request, id: unknown, enabled: boolean) {
  const scheduleId = toId(id);
  const doc = scheduleId ? await ResearchSchedule.findById(scheduleId) : null;
  if (!doc) throw new AppError(404, 'SCHEDULE_NOT_FOUND', 'Scheduled search not found');
  const emails = await emailsOf([doc.userId]);
  const withUser = (schedule: ReturnType<typeof toPublicSchedule>) => ({
    schedule: {
      ...schedule,
      userId: String(doc.userId),
      email: emails.get(String(doc.userId)) ?? null,
    },
  });
  if (doc.enabled === enabled) return withUser(toPublicSchedule(doc));

  const updated = await updateSchedule(doc.userId, doc._id.toString(), { enabled });
  await recordAudit(req, {
    action: enabled ? 'research_schedule.resume' : 'research_schedule.pause',
    targetType: 'user',
    targetId: String(doc.userId),
    before: { schedule: String(doc._id), enabled: !enabled },
    after: { schedule: String(doc._id), enabled },
  });
  return withUser(updated);
}
