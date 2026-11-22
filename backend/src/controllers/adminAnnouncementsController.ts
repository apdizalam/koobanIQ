import type { Request, Response } from 'express';
import {
  audienceCounts,
  listAnnouncements,
  parseAnnouncement,
  sendAnnouncement,
} from '../services/announcementService.js';

/** Whole number in [min, max]; anything else becomes the fallback. */
function intParam(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/** GET /api/v1/admin/announcements?page=&limit= (newest first) */
export async function getAnnouncements(req: Request, res: Response) {
  const data = await listAnnouncements({
    page: intParam(req.query.page, 1, 1, 10_000),
    limit: intParam(req.query.limit, 20, 1, 100),
  });
  res.json({ data, error: null, meta: {} });
}

/** GET /api/v1/admin/announcements/audience → { counts: { all, en, so } } */
export async function getAudience(_req: Request, res: Response) {
  res.json({ data: { counts: await audienceCounts() }, error: null, meta: {} });
}

/** POST /api/v1/admin/announcements { title: {en, so}, body: {en, so}, audience, push } → 201 */
export async function postAnnouncement(req: Request, res: Response) {
  const input = parseAnnouncement(req.body);
  res.status(201).json({ data: await sendAnnouncement(req, input), error: null, meta: {} });
}
