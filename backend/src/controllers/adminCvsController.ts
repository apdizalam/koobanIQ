import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { isCvStatus, listCvs } from '../services/adminCvService.js';

/** Whole number in [min, max]; anything else becomes the fallback. */
function intParam(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/** GET /api/v1/admin/cvs?status=&page=&limit= (newest first, status only, no CV content) */
export async function getAdminCvs(req: Request, res: Response) {
  const { status } = req.query;
  if (status !== undefined && !isCvStatus(status)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      status: 'choiceInvalid',
    });
  }
  const data = await listCvs({
    status,
    page: intParam(req.query.page, 1, 1, 10_000),
    limit: intParam(req.query.limit, 25, 1, 100),
  });
  res.json({ data, error: null, meta: {} });
}
