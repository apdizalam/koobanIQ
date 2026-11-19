import { Router } from 'express';
import { getCvs, getOneCv, postGenerateCv, removeCv } from '../controllers/cvsController.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** The signed-in user's own CVs (TIQ-9). No route takes a user id. */
export const cvsRouter = Router();

cvsRouter.use(requireAuth);
cvsRouter.post('/generate', postGenerateCv);
cvsRouter.get('/', getCvs);
cvsRouter.get('/:id', getOneCv);
cvsRouter.delete('/:id', removeCv);
