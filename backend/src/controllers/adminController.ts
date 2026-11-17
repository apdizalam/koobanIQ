import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { toPublicUser } from '../models/User.js';
import { getOverview, isPeriod } from '../services/overviewService.js';

/**
 * GET /api/v1/admin/access: 200 only for admins. The admin dashboard calls
 * it after login to decide whether to show the dashboard or "No access".
 */
export function getAdminAccess(req: Request, res: Response) {
  res.json({ data: { access: true, user: toPublicUser(req.user!) }, error: null, meta: {} });
}

/** GET /api/v1/admin/overview?period=day|week|month|year (default week) */
export async function getAdminOverview(req: Request, res: Response) {
  const period = req.query.period ?? 'week';
  if (!isPeriod(period)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      period: 'periodInvalid',
    });
  }
  res.json({ data: await getOverview(period), error: null, meta: {} });
}
