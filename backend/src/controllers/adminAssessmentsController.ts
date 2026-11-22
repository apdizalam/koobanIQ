import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import {
  flagQuestion,
  getAssessmentDetail,
  isAssessmentStatus,
  listAssessments,
  unflagQuestion,
} from '../services/adminAssessmentService.js';

/** Whole number in [min, max]; anything else becomes the fallback. */
function intParam(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/** GET /api/v1/admin/assessments?status=&skill=&page=&limit= (newest first) */
export async function getAdminAssessments(req: Request, res: Response) {
  const { status, skill } = req.query;
  if (status !== undefined && !isAssessmentStatus(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      status: 'choiceInvalid',
    });
  }
  const data = await listAssessments({
    status,
    skill: typeof skill === 'string' ? skill : undefined,
    page: intParam(req.query.page, 1, 1, 10_000),
    limit: intParam(req.query.limit, 25, 1, 100),
  });
  res.json({ data, error: null, meta: {} });
}

/** GET /api/v1/admin/assessments/:id */
export async function getAdminAssessment(req: Request, res: Response) {
  res.json({ data: await getAssessmentDetail(req.params.id), error: null, meta: {} });
}

/** POST /api/v1/admin/assessments/:id/questions/:questionId/flag { reason } */
export async function postFlagQuestion(req: Request, res: Response) {
  const reason = (req.body as { reason?: unknown } | undefined)?.reason;
  const data = await flagQuestion(req, req.params.id, req.params.questionId, reason);
  res.json({ data, error: null, meta: {} });
}

/** DELETE /api/v1/admin/assessments/:id/questions/:questionId/flag */
export async function deleteFlagQuestion(req: Request, res: Response) {
  const data = await unflagQuestion(req, req.params.id, req.params.questionId);
  res.json({ data, error: null, meta: {} });
}
