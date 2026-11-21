import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import {
  getRunDetail,
  isRunStatus,
  listAllSchedules,
  listRuns,
  retryRun,
  setScheduleEnabled,
} from '../services/adminResearchService.js';

/** Whole number in [min, max]; anything else becomes the fallback. */
function intParam(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

const invalid = (field: string, key: string) =>
  new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', { [field]: key });

const paging = (req: Request) => ({
  page: intParam(req.query.page, 1, 1, 10_000),
  limit: intParam(req.query.limit, 25, 1, 100),
});

/** GET /api/v1/admin/research-runs?status=&page=&limit= (newest first) */
export async function getAdminRuns(req: Request, res: Response) {
  const { status } = req.query;
  if (status !== undefined && !isRunStatus(status)) throw invalid('status', 'runStatusInvalid');
  res.json({ data: await listRuns({ status, ...paging(req) }), error: null, meta: {} });
}

/** GET /api/v1/admin/research-runs/:id */
export async function getAdminRun(req: Request, res: Response) {
  res.json({ data: await getRunDetail(req.params.id), error: null, meta: {} });
}

/** POST /api/v1/admin/research-runs/:id/retry → 201 with the new run */
export async function postRetryRun(req: Request, res: Response) {
  res.status(201).json({ data: await retryRun(req, req.params.id), error: null, meta: {} });
}

/** GET /api/v1/admin/research-schedules?page=&limit= (newest first) */
export async function getAdminSchedules(req: Request, res: Response) {
  res.json({ data: await listAllSchedules(paging(req)), error: null, meta: {} });
}

/** PATCH /api/v1/admin/research-schedules/:id { enabled: boolean } */
export async function patchAdminSchedule(req: Request, res: Response) {
  const enabled = (req.body as { enabled?: unknown } | undefined)?.enabled;
  if (typeof enabled !== 'boolean') throw invalid('enabled', 'enabledInvalid');
  res.json({ data: await setScheduleEnabled(req, req.params.id, enabled), error: null, meta: {} });
}
