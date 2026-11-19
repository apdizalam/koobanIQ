import { Router } from 'express';
import {
  getJobDescriptions,
  getOneJobDescription,
  postJobDescription,
  removeJobDescription,
} from '../controllers/jobDescriptionsController.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** The signed-in user's own job descriptions (TIQ-8). No route takes a user id. */
export const jobDescriptionsRouter = Router();

jobDescriptionsRouter.use(requireAuth);
jobDescriptionsRouter.post('/', postJobDescription);
jobDescriptionsRouter.get('/', getJobDescriptions);
jobDescriptionsRouter.get('/:id', getOneJobDescription);
jobDescriptionsRouter.delete('/:id', removeJobDescription);
