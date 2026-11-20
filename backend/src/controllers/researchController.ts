import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { parseResearchRequest } from '../lib/validateResearch.js';
import { parseJobSearch } from '../lib/validateJobSearch.js';
import {
  jobWithMatch,
  listSavedJobs,
  saveJob,
  searchStoredJobs,
  unsaveJob,
} from '../services/jobMatchService.js';
import { getRun, listRuns, startResearch } from '../services/researchService.js';

const signedInUser = (req: Request) => {
  if (!req.user) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue');
  return req.user;
};

/**
 * POST /api/v1/research/run { sourceKeys, regions?, filters? }: starts a search
 * of the selected sources in the background (TIQ-16) and answers at once with
 * the run (202, status "running"). Follow it with GET /research/runs/:id.
 */
export async function postResearchRun(req: Request, res: Response) {
  const user = signedInUser(req);
  const run = await startResearch(user._id, parseResearchRequest(req.body));
  res.status(202).json({ data: { run }, error: null, meta: {} });
}

/** GET /api/v1/research/runs: the user's latest runs (per-source results included). */
export async function getResearchRuns(req: Request, res: Response) {
  const user = signedInUser(req);
  res.json({ data: { runs: await listRuns(user._id) }, error: null, meta: {} });
}

/** GET /api/v1/research/runs/:id: one run and the jobs it found, ranked by region. */
export async function getResearchRun(req: Request, res: Response) {
  const user = signedInUser(req);
  res.json({ data: await getRun(user._id, req.params.id), error: null, meta: {} });
}

/** GET /api/v1/jobs/:id: one stored job, the user's match for it and whether it is saved. */
export async function getOneJob(req: Request, res: Response) {
  const user = signedInUser(req);
  res.json({ data: await jobWithMatch(user._id, req.params.id), error: null, meta: {} });
}

/**
 * GET /api/v1/jobs/search?q&regions&city&employerTypes&jobTypes&lower=1
 * (method A): the stored jobs, scored for the user, main results first.
 */
export async function getJobSearch(req: Request, res: Response) {
  const user = signedInUser(req);
  const data = await searchStoredJobs(
    user._id,
    parseJobSearch(req.query as Record<string, unknown>),
  );
  res.json({ data, error: null, meta: {} });
}

/** GET /api/v1/jobs/saved */
export async function getSavedJobs(req: Request, res: Response) {
  const user = signedInUser(req);
  res.json({ data: { jobs: await listSavedJobs(user._id) }, error: null, meta: {} });
}

/** PUT /api/v1/jobs/:id/save */
export async function putSavedJob(req: Request, res: Response) {
  const user = signedInUser(req);
  await saveJob(user._id, req.params.id);
  res.status(204).end();
}

/** DELETE /api/v1/jobs/:id/save */
export async function deleteSavedJob(req: Request, res: Response) {
  const user = signedInUser(req);
  await unsaveJob(user._id, req.params.id);
  res.status(204).end();
}
