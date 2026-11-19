import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { recordAudit } from '../services/auditService.js';

/**
 * Super-admin check for privacy-critical admin actions (AI personal-data
 * setting, test accounts). Use after requireAuth + requireRole(['admin']).
 * The flag comes from the database on every request and cannot be set
 * through the API. Refused attempts are written to the audit log.
 */
export async function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin' || req.user.superAdmin !== true) {
    await recordAudit(req, {
      action: 'admin.access_denied',
      targetType: 'route',
      targetId: `${req.method} ${req.originalUrl}`,
    });
    throw new AppError(403, 'SUPER_ADMIN_REQUIRED', 'Only a super admin can change this');
  }
  next();
}
