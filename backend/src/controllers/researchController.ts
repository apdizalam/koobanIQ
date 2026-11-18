import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { parseResearchRequest } from '../lib/validateResearch.js';
import { listRuns, runResearch } from '../services/researchService.js';

const signedInUser = (req: Request) => {
  if (!req.user) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue');
  return req.user;
};

/**
 * POST /api/v1/research/run { sourceKeys, regions?, filters? }: searches only the
 * selected sources now and returns the run record plus the jobs found, ranked by
 * region. (A background worker and saved jobs come with TIQ-16.)
 */
export async function postResearchRun(req: Request, res: Response) {
  const user = signedInUser(req);
  const result = await runResearch(user._id, parseResearchRequest(req.body));
  res.status(201).json({ data: result, error: null, meta: {} });
}

/** GET /api/v1/research/runs: the user's latest runs (per-source results included). */
export async function getResearchRuns(req: Request, res: Response) {
  const user = signedInUser(req);
  res.json({ data: { runs: await listRuns(user._id) }, error: null, meta: {} });
}
