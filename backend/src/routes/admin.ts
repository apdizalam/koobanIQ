import { Router } from 'express';
import { getAdminAccess } from '../controllers/adminController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

/** Everything under /api/v1/admin needs a signed-in admin; other users are turned away and logged. */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(['admin'], { auditDenied: true }));

adminRouter.get('/access', getAdminAccess);
