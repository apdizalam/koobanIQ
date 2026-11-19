import { Router } from 'express';
import { deleteSkill, getSkills, patchSkill, postSkill } from '../controllers/skillsController.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** The signed-in user's own skills (TIQ-12). No route takes a user id. */
export const skillsRouter = Router();

skillsRouter.use(requireAuth);
skillsRouter.get('/', getSkills);
skillsRouter.post('/', postSkill);
skillsRouter.patch('/:id', patchSkill);
skillsRouter.delete('/:id', deleteSkill);
