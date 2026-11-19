import type { Request, Response } from 'express';
import { parseJobDescriptionInput } from '../lib/validateJobDescription.js';
import {
  createJobDescription,
  deleteJobDescription,
  getJobDescription,
  listJobDescriptions,
} from '../services/jobDescriptionService.js';

/** POST /api/v1/job-descriptions { text } | { pdf: { data, fileName? } } */
export async function postJobDescription(req: Request, res: Response) {
  const input = parseJobDescriptionInput(req.body);
  const { jobDescription, reused } = await createJobDescription(req.user!._id, input);
  // 200 when the same ad was already saved (no AI request was made).
  res.status(reused ? 200 : 201).json({ data: { jobDescription }, error: null, meta: { reused } });
}

/** GET /api/v1/job-descriptions */
export async function getJobDescriptions(req: Request, res: Response) {
  res.json({
    data: { jobDescriptions: await listJobDescriptions(req.user!._id) },
    error: null,
    meta: {},
  });
}

/** GET /api/v1/job-descriptions/:id */
export async function getOneJobDescription(req: Request, res: Response) {
  const jobDescription = await getJobDescription(req.user!._id, req.params.id);
  res.json({ data: { jobDescription }, error: null, meta: {} });
}

/** DELETE /api/v1/job-descriptions/:id */
export async function removeJobDescription(req: Request, res: Response) {
  await deleteJobDescription(req.user!._id, req.params.id);
  res.status(204).end();
}
