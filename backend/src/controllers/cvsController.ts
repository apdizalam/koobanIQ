import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import {
  approveCv,
  deleteCv,
  editCv,
  exportCvPdf,
  generateCv,
  getCv,
  listCvs,
} from '../services/cvService.js';

/**
 * Body of POST /cvs/generate. `language` is required every time (the user picks
 * the CV language; it is never copied from the app language).
 */
function parseGenerateBody(body: unknown) {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  for (const key of Object.keys(b)) {
    if (key !== 'jobDescriptionId' && key !== 'language') details[key] = 'fieldNotEditable';
  }
  if (typeof b.jobDescriptionId !== 'string' || !b.jobDescriptionId) {
    details.jobDescriptionId = 'required';
  }
  if (b.language !== 'en' && b.language !== 'so') details.language = 'cvLanguageRequired';
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  return { jobDescriptionId: b.jobDescriptionId as string, language: b.language as 'en' | 'so' };
}

/** POST /api/v1/cvs/generate { jobDescriptionId, language } */
export async function postGenerateCv(req: Request, res: Response) {
  // Checked on every request: the privacy guard reads the account flag and the stored setting.
  const cv = await generateCv(req.user!, parseGenerateBody(req.body));
  res.status(201).json({ data: { cv }, error: null, meta: {} });
}

/** GET /api/v1/cvs */
export async function getCvs(req: Request, res: Response) {
  res.json({ data: { cvs: await listCvs(req.user!._id) }, error: null, meta: {} });
}

/** GET /api/v1/cvs/:id */
export async function getOneCv(req: Request, res: Response) {
  res.json({ data: { cv: await getCv(req.user!._id, req.params.id) }, error: null, meta: {} });
}

/** PATCH /api/v1/cvs/:id { headline?, summary?, experience?, projects? } (wording only) */
export async function patchCv(req: Request, res: Response) {
  const cv = await editCv(req.user!._id, req.params.id, req.body);
  res.json({ data: { cv }, error: null, meta: {} });
}

/** POST /api/v1/cvs/:id/approve */
export async function postApproveCv(req: Request, res: Response) {
  res.json({ data: { cv: await approveCv(req.user!._id, req.params.id) }, error: null, meta: {} });
}

/** GET /api/v1/cvs/:id/pdf → application/pdf (only for approved or exported CVs). */
export async function getCvPdf(req: Request, res: Response) {
  const { pdf, fileName } = await exportCvPdf(req.user!._id, req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
}

/** DELETE /api/v1/cvs/:id */
export async function removeCv(req: Request, res: Response) {
  await deleteCv(req.user!._id, req.params.id);
  res.status(204).end();
}
