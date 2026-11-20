import { Router } from 'express';
import {
  getInterviews,
  getOneInterview,
  postInterview,
  postInterviewAnswer,
  postInterviewCancel,
  removeInterview,
} from '../controllers/interviewsController.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** The signed-in user's own interview practice sessions (TIQ-19). No route takes a user id. */
export const interviewsRouter = Router();

interviewsRouter.use(requireAuth);
interviewsRouter.post('/', postInterview);
interviewsRouter.get('/', getInterviews);
interviewsRouter.get('/:id', getOneInterview);
interviewsRouter.post('/:id/answers', postInterviewAnswer);
interviewsRouter.post('/:id/cancel', postInterviewCancel);
interviewsRouter.delete('/:id', removeInterview);
