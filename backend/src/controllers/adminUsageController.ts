import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { isPeriod } from '../services/overviewService.js';
import { getUsage } from '../services/usageService.js';

/** GET /api/v1/admin/usage?period=day|week|month|year (default week) */
export async function getAdminUsage(req: Request, res: Response) {
  const period = req.query.period ?? 'week';
  if (!isPeriod(period)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      period: 'periodInvalid',
    });
  }
  res.json({ data: await getUsage(period), error: null, meta: {} });
}
