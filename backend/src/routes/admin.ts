import { Router } from 'express';
import { getAdminAccess, getAdminOverview } from '../controllers/adminController.js';
import { getAuditLogs } from '../controllers/adminAuditController.js';
import {
  getUser,
  getUsers,
  patchUserRole,
  patchUserStatus,
  removeUser,
} from '../controllers/adminUsersController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

/** Everything under /api/v1/admin needs a signed-in admin; other users are turned away and logged. */
export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(['admin'], { auditDenied: true }));

adminRouter.get('/access', getAdminAccess);
adminRouter.get('/overview', getAdminOverview);

// Users management (TIQ-33). Every change is written to auditLogs.
adminRouter.get('/users', getUsers);
adminRouter.get('/users/:id', getUser);
adminRouter.patch('/users/:id/status', patchUserStatus);
adminRouter.patch('/users/:id/role', patchUserRole);
adminRouter.delete('/users/:id', removeUser);

// Audit log (read-only).
adminRouter.get('/audit-logs', getAuditLogs);
