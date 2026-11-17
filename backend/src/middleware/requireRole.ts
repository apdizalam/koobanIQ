import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import type { Role } from '../models/User.js';

/**
 * Role check (the architecture doc's `rbac`). Use after requireAuth.
 * The role comes from the database on every request, so a role change
 * works at once, even for tokens that were issued earlier.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue');
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this page');
    }
    next();
  };
}
