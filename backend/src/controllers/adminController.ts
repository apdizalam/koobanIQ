import type { Request, Response } from 'express';
import { toPublicUser } from '../models/User.js';

/**
 * GET /api/v1/admin/access: 200 only for admins. The admin dashboard calls
 * it after login to decide whether to show the dashboard or "No access".
 */
export function getAdminAccess(req: Request, res: Response) {
  res.json({ data: { access: true, user: toPublicUser(req.user!) }, error: null, meta: {} });
}
