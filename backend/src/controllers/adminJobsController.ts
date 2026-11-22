import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import {
  getJobDetail,
  isJobState,
  listJobs,
  removeExpiredJobs,
  removeJob,
  restoreJob,
} from '../services/adminJobService.js';

/** Whole number in [min, max]; anything else becomes the fallback. */
function intParam(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/** GET /api/v1/admin/jobs?state=&source=&q=&page=&limit= (newest first) */
export async function getAdminJobs(req: Request, res: Response) {
  const { state, source, q } = req.query;
  if (state !== undefined && !isJobState(state)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      state: 'choiceInvalid',
    });
  }
  const data = await listJobs({
    state,
    source: typeof source === 'string' && source ? source.slice(0, 60) : undefined,
    q: typeof q === 'string' ? q : undefined,
    page: intParam(req.query.page, 1, 1, 10_000),
    limit: intParam(req.query.limit, 25, 1, 100),
  });
  res.json({ data, error: null, meta: {} });
}

/** GET /api/v1/admin/jobs/:id */
export async function getAdminJob(req: Request, res: Response) {
  res.json({ data: await getJobDetail(req.params.id), error: null, meta: {} });
}

/** POST /api/v1/admin/jobs/:id/remove { reason } */
export async function postRemoveJob(req: Request, res: Response) {
  const reason = (req.body as { reason?: unknown } | undefined)?.reason;
  res.json({ data: await removeJob(req, req.params.id, reason), error: null, meta: {} });
}

/** POST /api/v1/admin/jobs/:id/restore */
export async function postRestoreJob(req: Request, res: Response) {
  res.json({ data: await restoreJob(req, req.params.id), error: null, meta: {} });
}

/** POST /api/v1/admin/jobs/remove-expired → { removed } */
export async function postRemoveExpired(req: Request, res: Response) {
  res.json({ data: await removeExpiredJobs(req), error: null, meta: {} });
}
