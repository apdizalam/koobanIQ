import { Router, type Request, type Response } from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import { joinWaitlist, parseWaitlist } from '../services/waitlistService.js';

/** Public: the landing page's waitlist form (TIQ-34). No sign-in. */
export const waitlistRouter = Router();

export const waitlistLimit = { max: 10, windowMs: 60 * 60 * 1000 };

waitlistRouter.post('/', rateLimit(waitlistLimit), async (req: Request, res: Response) => {
  const { input, bot } = parseWaitlist(req.body);
  if (!bot) await joinWaitlist(input);
  res.status(201).json({ data: { joined: true }, error: null, meta: {} });
});
