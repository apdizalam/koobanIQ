import { Router, type Request, type Response } from 'express';
import { AppError } from '../lib/errors.js';
import { isTimeZone, REPORT_PERIODS, type ReportPeriod } from '../lib/zonedTime.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getReport } from '../services/reportService.js';

/** The signed-in user's own report (TIQ-20). No route takes a user id. */
export const reportsRouter = Router();

/**
 * GET /api/v1/reports?period=hour|day|week|month|year&tz=Africa/Mogadishu
 * (tz: the phone's IANA time zone; default UTC).
 */
reportsRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const details: Record<string, string> = {};
  const period = req.query.period ?? 'week';
  if (!(REPORT_PERIODS as readonly unknown[]).includes(period)) details.period = 'periodInvalid';
  const tz = req.query.tz ?? 'UTC';
  if (!isTimeZone(tz)) details.tz = 'timeZoneInvalid';
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  const report = await getReport(req.user!._id, period as ReportPeriod, tz as string);
  res.json({ data: { report }, error: null, meta: {} });
});
