import { Router } from 'express';
import {
  getCvPdf,
  getCvs,
  getOneCv,
  patchCv,
  postApproveCv,
  postGenerateCv,
  removeCv,
} from '../controllers/cvsController.js';
import { requireAuth } from '../middleware/requireAuth.js';

/** The signed-in user's own CVs (TIQ-9, TIQ-10). No route takes a user id. */
export const cvsRouter = Router();

cvsRouter.use(requireAuth);
cvsRouter.post('/generate', postGenerateCv);
cvsRouter.get('/', getCvs);
cvsRouter.get('/:id', getOneCv);
// TIQ-10: edit the wording, approve, download the PDF (approved only).
cvsRouter.patch('/:id', patchCv);
cvsRouter.post('/:id/approve', postApproveCv);
cvsRouter.get('/:id/pdf', getCvPdf);
cvsRouter.delete('/:id', removeCv);
