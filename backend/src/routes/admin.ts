import { Router } from 'express';
import { getAdminAccess, getAdminOverview } from '../controllers/adminController.js';
import { getAuditLogs } from '../controllers/adminAuditController.js';
import {
  getAdminRun,
  getAdminRuns,
  getAdminSchedules,
  patchAdminSchedule,
  postRetryRun,
} from '../controllers/adminResearchController.js';
import { getAdminUsage } from '../controllers/adminUsageController.js';
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
// Test accounts (fictional data) may use AI features while personal data is BLOCKED.
// Admins only (router-level check above); a reason is required and audited.
adminRouter.patch('/users/:id/test-account', patchTestAccount);

// AI personal-data setting (owner decision): admins view it and change it with a reason; default BLOCKED.
adminRouter.get('/settings/ai-personal-data', getAiPersonalData);
adminRouter.put('/settings/ai-personal-data', putAiPersonalData);

// AI usage (TIQ-23, read-only): monitoring and cost control, never a limit.
adminRouter.get('/usage', getAdminUsage);

// Research runs and schedules (TIQ-33): history, errors, retry, pause. Changes are audited.
adminRouter.get('/research-runs', getAdminRuns);
adminRouter.get('/research-runs/:id', getAdminRun);
adminRouter.post('/research-runs/:id/retry', postRetryRun);
adminRouter.get('/research-schedules', getAdminSchedules);
adminRouter.patch('/research-schedules/:id', patchAdminSchedule);

// Audit log (read-only).
adminRouter.get('/audit-logs', getAuditLogs);

// Job sources and regions (TIQ-32, doc 9 §8). Every change is written to auditLogs.
adminRouter.get('/job-sources', getAdminJobSources);
adminRouter.patch('/job-sources/:key', patchJobSource);
adminRouter.patch('/regions/:key', patchRegion);
