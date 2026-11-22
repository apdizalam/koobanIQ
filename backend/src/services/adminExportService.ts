import type { Request } from 'express';
import { toCsv, type CsvValue } from '../lib/csv.js';
import { Assessment } from '../models/Assessment.js';
import { Cv } from '../models/Cv.js';
import { Job } from '../models/Job.js';
import { JobDescription } from '../models/JobDescription.js';
import { ResearchRun } from '../models/ResearchRun.js';
import { UsageRecord } from '../models/UsageRecord.js';
import { User } from '../models/User.js';
import { Waitlist } from '../models/Waitlist.js';
import { recordAudit } from './auditService.js';
import type { QuizResult } from './quizEngine.js';

/** What can be exported (one CSV each). */
export const EXPORT_KINDS = [
  'users',
  'usage',
  'runs',
  'jobs',
  'cvs',
  'quizzes',
  'waitlist',
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export const isExportKind = (v: unknown): v is ExportKind =>
  (EXPORT_KINDS as readonly unknown[]).includes(v);

/** Records created in the last day / week / month / year, or all of them. */
export const EXPORT_PERIODS = ['day', 'week', 'month', 'year', 'all'] as const;
export type ExportPeriod = (typeof EXPORT_PERIODS)[number];
export const isExportPeriod = (v: unknown): v is ExportPeriod =>
  (EXPORT_PERIODS as readonly unknown[]).includes(v);

/** Most rows in one file (newest first); the answer says when it was cut. */
export const MAX_EXPORT_ROWS = 10_000;

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Exclude<ExportPeriod, 'all'>, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

const since = (period: ExportPeriod, now: Date) =>
  period === 'all' ? null : new Date(now.getTime() - PERIOD_DAYS[period] * DAY_MS);

async function emailsOf(ids: unknown[]) {
  const users = await User.find({ _id: { $in: ids } }, { email: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.email]));
}

interface Table {
  header: string[];
  rows: CsvValue[][];
}

async function usersTable(from: Date | null): Promise<Table> {
  const users = await User.find(from ? { createdAt: { $gte: from } } : {})
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT_ROWS + 1)
    .lean();
  return {
    header: [
      'email',
      'role',
      'status',
      'language',
      'email_verified',
      'test_account',
      'joined',
      'last_active',
    ],
    rows: users.map((u) => [
      u.email,
      u.role,
      u.status,
      u.preferredLanguage,
      u.emailVerified,
      u.testAccount,
      u.createdAt,
      u.lastActiveAt,
    ]),
  };
}

async function usageTable(from: Date | null): Promise<Table> {
  const records = await UsageRecord.find(from ? { createdAt: { $gte: from } } : {})
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT_ROWS + 1)
    .lean();
  const emails = await emailsOf(records.map((r) => r.userId));
  return {
    header: [
      'when',
      'user',
      'feature',
      'status',
      'input_tokens',
      'output_tokens',
      'attempts',
      'duration_ms',
    ],
    rows: records.map((r) => [
      r.createdAt,
      emails.get(String(r.userId)) ?? '',
      r.feature,
      r.status,
      r.inputTokens,
      r.outputTokens,
      r.attempts,
      r.durationMs,
    ]),
  };
}

async function runsTable(from: Date | null): Promise<Table> {
  const runs = await ResearchRun.find(from ? { createdAt: { $gte: from } } : {}, { jobIds: 0 })
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT_ROWS + 1)
    .lean();
  const emails = await emailsOf(runs.map((r) => r.userId));
  return {
    header: [
      'started',
      'user',
      'trigger',
      'status',
      'sources',
      'jobs_found',
      'jobs_new',
      'failed_sources',
      'error',
      'finished',
    ],
    rows: runs.map((r) => [
      r.startedAt,
      emails.get(String(r.userId)) ?? '',
      r.retryOf ? 'retry' : r.scheduleId ? 'scheduled' : 'manual',
      r.status,
      r.sourceKeys.join(' '),
      r.jobsFound ?? 0,
      r.jobsNew ?? 0,
      (r.perSource ?? [])
        .filter((p) => p.error)
        .map((p) => p.key)
        .join(' '),
      r.error,
      r.finishedAt,
    ]),
  };
}

async function jobsTable(from: Date | null): Promise<Table> {
  const jobs = await Job.find(from ? { firstSeenAt: { $gte: from } } : {}, { description: 0 })
    .sort({ firstSeenAt: -1 })
    .limit(MAX_EXPORT_ROWS + 1)
    .lean();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return {
    header: [
      'first_seen',
      'title',
      'employer',
      'employer_type',
      'region',
      'city',
      'sources',
      'deadline',
      'state',
      'removed_reason',
      'apply_url',
    ],
    rows: jobs.map((j) => [
      j.firstSeenAt,
      j.title,
      j.employer,
      j.employerType,
      j.region,
      j.city,
      [...new Set((j.sources ?? []).map((s) => s.sourceKey))].join(' '),
      j.deadline,
      j.removedAt ? 'removed' : j.deadline && j.deadline < today ? 'expired' : 'active',
      j.removedReason,
      j.applyUrl,
    ]),
  };
}

/** CV status only: the CV text is the user's and never exported. */
async function cvsTable(from: Date | null): Promise<Table> {
  const cvs = await Cv.find(from ? { createdAt: { $gte: from } } : {}, { content: 0 })
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT_ROWS + 1)
    .lean();
  const [emails, ads] = await Promise.all([
    emailsOf(cvs.map((c) => c.userId)),
    JobDescription.find(
      { _id: { $in: cvs.map((c) => c.jobDescriptionId) } },
      { extracted: 1 },
    ).lean(),
  ]);
  const adOf = new Map(ads.map((a) => [String(a._id), a.extracted]));
  return {
    header: [
      'created',
      'user',
      'job_title',
      'company',
      'cv_language',
      'version',
      'status',
      'missing_info',
      'approved',
      'downloaded',
    ],
    rows: cvs.map((c) => [
      c.createdAt,
      emails.get(String(c.userId)) ?? '',
      adOf.get(String(c.jobDescriptionId))?.title,
      adOf.get(String(c.jobDescriptionId))?.company,
      c.language,
      c.version,
      c.status,
      (c.missingInfo ?? []).length,
      c.approvedAt,
      c.exportedAt,
    ]),
  };
}

async function quizzesTable(from: Date | null): Promise<Table> {
  const quizzes = await Assessment.find(from ? { createdAt: { $gte: from } } : {}, {
    bank: 0,
    state: 0,
  })
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT_ROWS + 1)
    .lean();
  const emails = await emailsOf(quizzes.map((q) => q.userId));
  return {
    header: [
      'started',
      'user',
      'skill',
      'language',
      'length',
      'status',
      'answered',
      'score_percent',
      'level',
      'flags',
      'finished',
    ],
    rows: quizzes.map((q) => {
      const result = (q.result as QuizResult | null) ?? null;
      return [
        q.createdAt,
        emails.get(String(q.userId)) ?? '',
        q.skillName,
        q.language,
        q.length,
        q.status,
        (q.asked ?? []).length,
        result?.scorePercent,
        result?.level,
        (q.flags ?? []).length,
        q.finishedAt,
      ];
    }),
  };
}

/** Landing page waitlist (TIQ-34). */
async function waitlistTable(from: Date | null): Promise<Table> {
  const people = await Waitlist.find(from ? { createdAt: { $gte: from } } : {})
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT_ROWS + 1)
    .lean();
  return {
    header: ['joined', 'email', 'name', 'language', 'consent_at'],
    rows: people.map((p) => [p.createdAt, p.email, p.name, p.language, p.consentAt]),
  };
}

const TABLES: Record<ExportKind, (from: Date | null) => Promise<Table>> = {
  users: usersTable,
  usage: usageTable,
  runs: runsTable,
  jobs: jobsTable,
  cvs: cvsTable,
  quizzes: quizzesTable,
  waitlist: waitlistTable,
};

/**
 * GET /admin/reports/:kind?period= (TIQ-33): one CSV of the records created in
 * the period (newest first, at most 10,000 rows). The file can hold personal
 * data (emails), so every export is audited.
 */
export async function exportCsv(
  req: Request,
  kind: ExportKind,
  period: ExportPeriod,
  now = new Date(),
) {
  const table = await TABLES[kind](since(period, now));
  const truncated = table.rows.length > MAX_EXPORT_ROWS;
  const rows = truncated ? table.rows.slice(0, MAX_EXPORT_ROWS) : table.rows;
  await recordAudit(req, {
    action: 'report.export',
    targetType: 'report',
    targetId: kind,
    after: { kind, period, rows: rows.length },
  });
  return {
    filename: `kobaniq-${kind}-${period}-${now.toISOString().slice(0, 10)}.csv`,
    rows: rows.length,
    truncated,
    csv: toCsv(table.header, rows),
  };
}
