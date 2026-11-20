import { Router } from 'express';
import {
  getAssessments,
  getOneAssessment,
  postAnswer,
  postAssessment,
  postCancel,
} from '../controllers/assessmentsController.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** The signed-in user's own skill quizzes (TIQ-13). No route takes a user id. */
export const assessmentsRouter = Router();

assessmentsRouter.use(requireAuth);
assessmentsRouter.post('/', postAssessment);
assessmentsRouter.get('/', getAssessments);
assessmentsRouter.get('/:id', getOneAssessment);
assessmentsRouter.post('/:id/answers', postAnswer);
assessmentsRouter.post('/:id/cancel', postCancel);
