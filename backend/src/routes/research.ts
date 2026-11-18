import { Router } from 'express';
import { getResearchRuns, postResearchRun } from '../controllers/researchController.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** Job research for the signed-in user (doc 9 §5–6). */
export const researchRouter = Router();

researchRouter.post('/run', requireAuth, postResearchRun);
researchRouter.get('/runs', requireAuth, getResearchRuns);
