import { Router } from 'express';
import {
  getOneJob,
  getResearchRun,
  getResearchRuns,
  postResearchRun,
} from '../controllers/researchController.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** Job research for the signed-in user (doc 9 §5–6, TIQ-16). */
export const researchRouter = Router();

researchRouter.post('/run', requireAuth, postResearchRun);
researchRouter.get('/runs', requireAuth, getResearchRuns);
researchRouter.get('/runs/:id', requireAuth, getResearchRun);

/** Stored jobs (shared by all users; found by research runs). */
export const jobsRouter = Router();

jobsRouter.get('/:id', requireAuth, getOneJob);
