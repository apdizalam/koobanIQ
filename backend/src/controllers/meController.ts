import type { Request, Response } from 'express';
import { toPublicUser } from '../models/User.js';

/** GET /api/v1/me: the signed-in user's account. */
export function getMe(req: Request, res: Response) {
  res.json({ data: { user: toPublicUser(req.user!) }, error: null, meta: {} });
}
