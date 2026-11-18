import { Router } from 'express';
import { getJobSources, getRegions } from '../controllers/jobSourcesController.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** For the app's research setup (doc 9 §5): regions, then the sources for them. */
export const regionsRouter = Router();
regionsRouter.get('/', requireAuth, getRegions);

export const jobSourcesRouter = Router();
jobSourcesRouter.get('/', requireAuth, getJobSources);
