import { Router } from 'express';
import {
  deleteSavedJob,
  getJobSearch,
  getOneJob,
  getResearchRun,
  getSavedJobs,
  putSavedJob,
  getResearchRuns,
  postResearchRun,
} from '../controllers/researchController.js';
import {
  getSchedules,
  patchSchedule,
  postSchedule,
  removeSchedule,
} from '../controllers/schedulesController.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** Job research for the signed-in user (doc 9 §5–6, TIQ-16). */
export const researchRouter = Router();

researchRouter.post('/run', requireAuth, postResearchRun);
researchRouter.get('/runs', requireAuth, getResearchRuns);
researchRouter.get('/runs/:id', requireAuth, getResearchRun);

// Scheduled searches (TIQ-21).
researchRouter.post('/schedules', requireAuth, postSchedule);
researchRouter.get('/schedules', requireAuth, getSchedules);
researchRouter.patch('/schedules/:id', requireAuth, patchSchedule);
researchRouter.delete('/schedules/:id', requireAuth, removeSchedule);

/** Stored jobs (shared; found by research runs), scored per user; saved jobs (personal). */
export const jobsRouter = Router();

// Fixed paths before /:id.
jobsRouter.get('/search', requireAuth, getJobSearch);
jobsRouter.get('/saved', requireAuth, getSavedJobs);
jobsRouter.get('/:id', requireAuth, getOneJob);
jobsRouter.put('/:id/save', requireAuth, putSavedJob);
jobsRouter.delete('/:id/save', requireAuth, deleteSavedJob);
