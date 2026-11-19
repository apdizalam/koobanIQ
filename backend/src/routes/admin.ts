import { Router } from 'express';
import { getAdminAccess, getAdminOverview } from '../controllers/adminController.js';
import { getAuditLogs } from '../controllers/adminAuditController.js';
import {
  getAiPersonalData,
  patchTestAccount,
  putAiPersonalData,
} from '../controllers/adminSettingsController.js';
import {
  getUser,
  getUsers,
  patchUserRole,
  patchUserStatus,
  removeUser,
} from '../controllers/adminUsersController.js';
import {
  getAdminJobSources,
  patchJobSource,
  patchRegion,
} from '../controllers/jobSourcesController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';

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
// Test accounts (fictional data) may use AI features while personal data is BLOCKED: super admin only.
adminRouter.patch('/users/:id/test-account', requireSuperAdmin, patchTestAccount);

// AI personal-data setting (owner decision): admins may view; only a super admin may change it.
adminRouter.get('/settings/ai-personal-data', getAiPersonalData);
adminRouter.put('/settings/ai-personal-data', requireSuperAdmin, putAiPersonalData);

// Audit log (read-only).
adminRouter.get('/audit-logs', getAuditLogs);

// Job sources and regions (TIQ-32, doc 9 §8). Every change is written to auditLogs.
adminRouter.get('/job-sources', getAdminJobSources);
adminRouter.patch('/job-sources/:key', patchJobSource);
adminRouter.patch('/regions/:key', patchRegion);
