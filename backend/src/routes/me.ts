import { Router } from 'express';
import { getMe } from '../controllers/meController.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const meRouter = Router();

meRouter.get('/', requireAuth, getMe);
