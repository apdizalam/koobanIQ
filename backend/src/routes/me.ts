import { Router } from 'express';
import { getMe, updateMe } from '../controllers/meController.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const meRouter = Router();

meRouter.get('/', requireAuth, getMe);
meRouter.patch('/', requireAuth, updateMe);
