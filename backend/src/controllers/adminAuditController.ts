import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { isAuditAction, listAuditLogs } from '../services/auditLogService.js';

/** Whole number in [min, max]; anything else becomes the fallback. */
function intParam(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/** GET /api/v1/admin/audit-logs?action=&page=&limit= (newest first) */
export async function getAuditLogs(req: Request, res: Response) {
  const { action } = req.query;
  if (action !== undefined && !isAuditAction(action)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      action: 'auditActionInvalid',
    });
  }
  const data = await listAuditLogs({
    action,
    page: intParam(req.query.page, 1, 1, 10_000),
    limit: intParam(req.query.limit, 25, 1, 100),
  });
  res.json({ data, error: null, meta: {} });
}
