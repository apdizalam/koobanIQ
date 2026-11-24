import { Types } from 'mongoose';
import { INTERVIEW_TYPES, type InterviewType } from '../ai/schemas/interview.js';
import { AppError } from '../lib/errors.js';
import { INTERVIEW_STATUSES, Interview } from '../models/Interview.js';
import { User } from '../models/User.js';
import type { Period } from './overviewService.js';

export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];
export const isInterviewStatus = (v: unknown): v is InterviewStatus =>
  (INTERVIEW_STATUSES as readonly unknown[]).includes(v);
export const isInterviewType = (v: unknown): v is InterviewType =>
  (INTERVIEW_TYPES as readonly unknown[]).includes(v);
export const isInterviewLanguage = (v: unknown): v is 'en' | 'so' => v === 'en' || v === 'so';

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30, year: 365 };

/**
 * What an admin may read of an answer: only its score and time. The typed
 * answer is the user's own words, and the AI feedback (summary, strengths,
 * improvements, better answer) repeats and rewrites it, so none of it leaves
 * the database here (same rule as CVs: metadata, never the user's content).
 */
const PRIVATE_FIELDS = {
  'answers.answer': 0,
  'answers.feedback.summary': 0,
  'answers.feedback.strengths': 0,
  'answers.feedback.improvements': 0,
  'answers.feedback.betterAnswer': 0,
} as const;

interface ScoredAnswer {
  questionId: string;
  feedback?: { score?: number };
  answeredAt?: Date;
}

const scoresOf = (answers: unknown) =>
  ((answers ?? []) as ScoredAnswer[])
    .map((a) => a.feedback?.score)
    .filter((s): s is number => typeof s === 'number');

/** Average answer score out of 10, one decimal; null before the first answer. */
const average = (scores: number[]) =>
  scores.length === 0
    ? null
    : Math.round((scores.reduce((n, s) => n + s, 0) / scores.length) * 10) / 10;

const toId = (id: unknown) =>
  typeof id === 'string' && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;

async function emailsOf(ids: unknown[]) {
  const users = await User.find({ _id: { $in: ids } }, { email: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.email]));
}

/**
 * GET /admin/interviews: every user's interview practice sessions, newest
 * first, read-only. Who, which type, the job practised for, language, length,
 * how many questions were answered and the average score, and the dates.
 * Filters: status, type, language, and a period (started in the last day /
 * week / month / year). The cards count the sessions per status with the same
 * type, language and period filters, plus the average score of finished ones.
 */
export async function listInterviews(query: {
  status?: InterviewStatus;
  type?: InterviewType;
  language?: 'en' | 'so';
  period?: Period;
  page: number;
  limit: number;
  now?: Date;
}) {
  const base: Record<string, unknown> = {};
  if (query.type) base.type = query.type;
  if (query.language) base.language = query.language;
  if (query.period) {
    const now = query.now ?? new Date();
    base.createdAt = { $gte: new Date(now.getTime() - PERIOD_DAYS[query.period] * DAY_MS) };
  }
  const filter = query.status ? { ...base, status: query.status } : base;

  const [docs, total, byStatus, finishedScore] = await Promise.all([
    Interview.find(filter, { questions: 0, skills: 0, responsibilities: 0, ...PRIVATE_FIELDS })
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Interview.countDocuments(filter),
    Interview.aggregate<{ _id: string; n: number }>([
      { $match: base },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
    Interview.aggregate<{ _id: null; avg: number | null }>([
      { $match: { ...base, status: 'finished' } },
      { $unwind: '$answers' },
      { $group: { _id: null, avg: { $avg: '$answers.feedback.score' } } },
    ]),
  ]);
  const emails = await emailsOf(docs.map((d) => d.userId));
  const count = (s: InterviewStatus) => byStatus.find((b) => b._id === s)?.n ?? 0;
  const avg = finishedScore[0]?.avg;
  return {
    summary: {
      finished: count('finished'),
      inProgress: count('in_progress'),
      cancelled: count('cancelled'),
      averageScore: typeof avg === 'number' ? Math.round(avg * 10) / 10 : null,
    },
    items: docs.map((d) => {
      const scores = scoresOf(d.answers);
      return {
        id: String(d._id),
        userId: String(d.userId),
        email: emails.get(String(d.userId)) ?? null,
        type: d.type,
        role: d.role,
        employer: d.employer ?? null,
        language: d.language,
        length: d.length,
        status: d.status,
        answered: scores.length,
        averageScore: average(scores),
        createdAt: d.createdAt,
        finishedAt: d.finishedAt ?? null,
      };
    }),
    total,
    page: query.page,
    limit: query.limit,
  };
}

/**
 * GET /admin/interviews/:id: one session for the admin. The AI's questions
 * (to review their quality) with each answer's score and time, never the
 * user's answer or the feedback on it.
 */
export async function getInterviewDetail(id: unknown) {
  const interviewId = toId(id);
  const doc = interviewId
    ? await Interview.findById(interviewId, {
        skills: 0,
        responsibilities: 0,
        ...PRIVATE_FIELDS,
      }).lean()
    : null;
  if (!doc) throw new AppError(404, 'INTERVIEW_NOT_FOUND', 'Interview practice not found');
  const emails = await emailsOf([doc.userId]);
  const answers = (doc.answers ?? []) as ScoredAnswer[];
  const scores = scoresOf(answers);
  return {
    interview: {
      id: String(doc._id),
      userId: String(doc.userId),
      email: emails.get(String(doc.userId)) ?? null,
      type: doc.type,
      role: doc.role,
      employer: doc.employer ?? null,
      jobDescriptionId: doc.jobDescriptionId ? String(doc.jobDescriptionId) : null,
      jobId: doc.jobId ? String(doc.jobId) : null,
      language: doc.language,
      length: doc.length,
      status: doc.status,
      answered: scores.length,
      averageScore: average(scores),
      createdAt: doc.createdAt,
      finishedAt: doc.finishedAt ?? null,
      questions: doc.questions.map((q, index) => {
        const a = answers.find((x) => x.questionId === q.id);
        return {
          number: index + 1,
          id: q.id,
          question: q.question,
          focus: q.focus,
          score: typeof a?.feedback?.score === 'number' ? a.feedback.score : null,
          answeredAt: a?.answeredAt ?? null,
        };
      }),
    },
  };
}
