import type { Request } from 'express';
import { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { ASSESSMENT_STATUSES, Assessment, type AssessmentDocument } from '../models/Assessment.js';
import { User } from '../models/User.js';
import { recordAudit } from './auditService.js';
import type { AskedQuestion, BankQuestion, QuizResult } from './quizEngine.js';

export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];
export const isAssessmentStatus = (v: unknown): v is AssessmentStatus =>
  (ASSESSMENT_STATUSES as readonly unknown[]).includes(v);

/** Longest reason an admin can give for a flag. */
export const FLAG_REASON_MAX = 300;

const toId = (id: unknown) =>
  typeof id === 'string' && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function emailsOf(ids: unknown[]) {
  const users = await User.find({ _id: { $in: ids } }, { email: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.email]));
}

/**
 * GET /admin/assessments (TIQ-33): every user's skill quizzes, newest first,
 * with the result (score and level) and how many questions admins flagged.
 * Filters: status, and part of the skill name.
 */
export async function listAssessments(query: {
  status?: AssessmentStatus;
  skill?: string;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.skill?.trim()) {
    filter.skillName = { $regex: escapeRegex(query.skill.trim().slice(0, 60)), $options: 'i' };
  }
  const [docs, total, summary] = await Promise.all([
    Assessment.find(filter, { bank: 0, state: 0 })
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Assessment.countDocuments(filter),
    Assessment.aggregate<{ _id: string; n: number; flags: number }>([
      { $group: { _id: '$status', n: { $sum: 1 }, flags: { $sum: { $size: '$flags' } } } },
    ]),
  ]);
  const emails = await emailsOf(docs.map((d) => d.userId));
  const count = (status: string) => summary.find((s) => s._id === status)?.n ?? 0;
  return {
    summary: {
      finished: count('finished'),
      inProgress: count('in_progress'),
      cancelled: count('cancelled'),
      flaggedQuestions: summary.reduce((n, s) => n + s.flags, 0),
    },
    items: docs.map((d) => {
      const result = (d.result as QuizResult | null) ?? null;
      return {
        id: String(d._id),
        userId: String(d.userId),
        email: emails.get(String(d.userId)) ?? null,
        skillName: d.skillName,
        language: d.language,
        length: d.length,
        status: d.status,
        answered: (d.asked ?? []).length,
        scorePercent: result?.scorePercent ?? null,
        level: result?.level ?? null,
        flags: (d.flags ?? []).length,
        createdAt: d.createdAt,
        finishedAt: d.finishedAt ?? null,
      };
    }),
    total,
    page: query.page,
    limit: query.limit,
  };
}

async function findAssessment(id: unknown) {
  const assessmentId = toId(id);
  const doc = assessmentId ? await Assessment.findById(assessmentId) : null;
  if (!doc) throw new AppError(404, 'ASSESSMENT_NOT_FOUND', 'Quiz not found');
  return doc;
}

/** One quiz for the admin: the result and every answered question with the answer, choice and flag. */
async function toAdminDetail(doc: AssessmentDocument) {
  const bank = doc.bank as unknown as BankQuestion[];
  const asked = doc.asked as unknown as AskedQuestion[];
  const flags = doc.flags ?? [];
  const emails = await emailsOf([doc.userId, ...flags.map((f) => f.flaggedBy)]);
  return {
    assessment: {
      id: String(doc._id),
      userId: String(doc.userId),
      email: emails.get(String(doc.userId)) ?? null,
      skillName: doc.skillName,
      language: doc.language,
      length: doc.length,
      startDifficulty: doc.startDifficulty,
      status: doc.status,
      result: (doc.result as QuizResult | null) ?? null,
      createdAt: doc.createdAt,
      finishedAt: doc.finishedAt ?? null,
      questions: asked.map((a, index) => {
        const q = bank.find((b) => b.id === a.questionId);
        const flag = flags.find((f) => f.questionId === a.questionId);
        return {
          number: index + 1,
          id: a.questionId,
          topic: a.topic,
          difficulty: a.difficulty,
          question: q?.question ?? '',
          options: q?.options ?? [],
          answer: q?.answer ?? null,
          choice: a.choice,
          correct: a.correct,
          explanation: q?.explanation ?? '',
          flag: flag
            ? {
                reason: flag.reason,
                by: emails.get(String(flag.flaggedBy)) ?? null,
                at: flag.flaggedAt,
              }
            : null,
        };
      }),
    },
  };
}

/** GET /admin/assessments/:id */
export async function getAssessmentDetail(id: unknown) {
  return toAdminDetail(await findAssessment(id));
}

function answeredQuestion(doc: AssessmentDocument, questionId: unknown) {
  const asked = doc.asked as unknown as AskedQuestion[];
  if (typeof questionId !== 'string' || !asked.some((a) => a.questionId === questionId)) {
    throw new AppError(404, 'NOT_FOUND', 'Not found');
  }
  return questionId;
}

/**
 * POST /admin/assessments/:id/questions/:questionId/flag { reason }: marks an
 * answered question as wrong or unclear, for reviewing the AI's questions. The
 * user's result is not changed. Flagging again replaces the reason. Audited.
 */
export async function flagQuestion(
  req: Request,
  id: unknown,
  questionId: unknown,
  reason: unknown,
) {
  const doc = await findAssessment(id);
  const qid = answeredQuestion(doc, questionId);
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (!text) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      reason: 'required',
    });
  }
  if (text.length > FLAG_REASON_MAX) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      reason: 'textTooLong',
    });
  }
  const before = doc.flags.find((f) => f.questionId === qid);
  doc.set('flags', [
    ...doc.flags.filter((f) => f.questionId !== qid),
    { questionId: qid, reason: text, flaggedBy: req.user!._id, flaggedAt: new Date() },
  ]);
  await doc.save();
  await recordAudit(req, {
    action: 'assessment.flag_question',
    targetType: 'user',
    targetId: String(doc.userId),
    before: { flag: before?.reason ?? null },
    after: { flag: text },
    reason: `${doc.skillName} · ${qid}`,
  });
  return toAdminDetail(doc);
}

/** DELETE /admin/assessments/:id/questions/:questionId/flag: takes the flag away. Audited. */
export async function unflagQuestion(req: Request, id: unknown, questionId: unknown) {
  const doc = await findAssessment(id);
  const qid = answeredQuestion(doc, questionId);
  const before = doc.flags.find((f) => f.questionId === qid);
  if (!before) return toAdminDetail(doc);
  doc.set(
    'flags',
    doc.flags.filter((f) => f.questionId !== qid),
  );
  await doc.save();
  await recordAudit(req, {
    action: 'assessment.unflag_question',
    targetType: 'user',
    targetId: String(doc.userId),
    before: { flag: before.reason },
    after: { flag: null },
    reason: `${doc.skillName} · ${qid}`,
  });
  return toAdminDetail(doc);
}
