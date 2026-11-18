import { Router } from 'express';
import {
  deleteItem,
  getMyProfile,
  patchItem,
  patchPersonal,
  postItem,
  putPreferences,
} from '../controllers/profileController.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * The signed-in user's own profile (TIQ-6). No route takes a user id: every
 * request works on the caller's profile only.
 */
export const profileRouter = Router();

profileRouter.use(requireAuth);
profileRouter.get('/', getMyProfile);
profileRouter.patch('/personal', patchPersonal);
profileRouter.put('/preferences', putPreferences);
profileRouter.post('/:section', postItem);
profileRouter.patch('/:section/:itemId', patchItem);
profileRouter.delete('/:section/:itemId', deleteItem);
