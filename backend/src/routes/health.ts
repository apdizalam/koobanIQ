import { Router } from 'express';
import { getDbStatus } from '../lib/db.js';

export const healthRouter = Router();

/** GET /api/v1/health — reports API and MongoDB Atlas status. */
healthRouter.get('/', async (_req, res) => {
  const db = await getDbStatus();
  const status = db.ok ? 'ok' : 'degraded';
  res.status(db.ok ? 200 : 503).json({
    data: { status, service: 'kobaniq-api', db, uptimeSeconds: Math.round(process.uptime()) },
    error: db.ok ? null : { code: 'DB_UNAVAILABLE', message: 'Database is not reachable' },
    meta: { timestamp: new Date().toISOString() },
  });
});
