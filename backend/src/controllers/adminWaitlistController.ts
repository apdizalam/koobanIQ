import type { Request, Response } from 'express';
import { listWaitlist } from '../services/adminWaitlistService.js';

/** Whole number in [min, max]; anything else becomes the fallback. */
function intParam(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/** GET /api/v1/admin/waitlist?q=&page=&limit= (admins only, newest first) */
export async function getAdminWaitlist(req: Request, res: Response) {
  const { q } = req.query;
  const data = await listWaitlist({
    q: typeof q === 'string' ? q : undefined,
    page: intParam(req.query.page, 1, 1, 10_000),
    limit: intParam(req.query.limit, 25, 1, 100),
  });
  res.json({ data, error: null, meta: {} });
}
