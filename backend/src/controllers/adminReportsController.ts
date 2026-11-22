import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { exportCsv, isExportKind, isExportPeriod } from '../services/adminExportService.js';

/** GET /api/v1/admin/reports/:kind?period=day|week|month|year|all → { filename, rows, truncated, csv } */
export async function getReportCsv(req: Request, res: Response) {
  const { kind } = req.params;
  const period = req.query.period ?? 'month';
  if (!isExportKind(kind)) throw new AppError(404, 'NOT_FOUND', 'Not found');
  if (!isExportPeriod(period)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      period: 'periodInvalid',
    });
  }
  res.json({ data: await exportCsv(req, kind, period), error: null, meta: {} });
}
