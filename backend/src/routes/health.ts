import { Router } from 'express';
import { requestLanguage, translate } from '../lib/i18n.js';
import { getDbStatus } from '../services/dbStatus.js';

export const healthRouter = Router();

/** GET /api/v1/health — reports API and MongoDB Atlas status. */
healthRouter.get('/', async (req, res) => {
  const db = await getDbStatus();
  const status = db.ok ? 'ok' : 'degraded';
  const message =
    translate(requestLanguage(req), 'server.errors.DB_UNAVAILABLE') ?? 'Database is not reachable';
  res.status(db.ok ? 200 : 503).json({
    data: { status, service: 'kobaniq-api', db, uptimeSeconds: Math.round(process.uptime()) },
    error: db.ok ? null : { code: 'DB_UNAVAILABLE', message },
    meta: { timestamp: new Date().toISOString() },
  });
});
