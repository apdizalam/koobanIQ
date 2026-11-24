import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import {
  getInterviewDetail,
  isInterviewLanguage,
  isInterviewStatus,
  isInterviewType,
  listInterviews,
} from '../services/adminInterviewService.js';
import { isPeriod } from '../services/overviewService.js';

/** Whole number in [min, max]; anything else becomes the fallback. */
function intParam(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/**
 * GET /api/v1/admin/interviews?status=&type=&language=&period=&page=&limit=
 * (newest first, metadata and scores only, never the user's answers)
 */
export async function getAdminInterviews(req: Request, res: Response) {
  const { status, type, language, period } = req.query;
  const details: Record<string, string> = {};
  if (status !== undefined && !isInterviewStatus(status)) details.status = 'choiceInvalid';
  if (type !== undefined && !isInterviewType(type)) details.type = 'choiceInvalid';
  if (language !== undefined && !isInterviewLanguage(language)) details.language = 'choiceInvalid';
  if (period !== undefined && !isPeriod(period)) details.period = 'periodInvalid';
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  const data = await listInterviews({
    status: isInterviewStatus(status) ? status : undefined,
    type: isInterviewType(type) ? type : undefined,
    language: isInterviewLanguage(language) ? language : undefined,
    period: isPeriod(period) ? period : undefined,
    page: intParam(req.query.page, 1, 1, 10_000),
    limit: intParam(req.query.limit, 25, 1, 100),
  });
  res.json({ data, error: null, meta: {} });
}

/** GET /api/v1/admin/interviews/:id */
export async function getAdminInterview(req: Request, res: Response) {
  res.json({ data: await getInterviewDetail(req.params.id), error: null, meta: {} });
}
