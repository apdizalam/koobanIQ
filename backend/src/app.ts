import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { cvsRouter } from './routes/cvs.js';
import { healthRouter } from './routes/health.js';
import { jobDescriptionsRouter } from './routes/jobDescriptions.js';
import { jobSourcesRouter, regionsRouter } from './routes/jobSources.js';
import { meRouter } from './routes/me.js';
import { profileRouter } from './routes/profile.js';
import { researchRouter } from './routes/research.js';
import { skillsRouter } from './routes/skills.js';

export function createApp() {
  const app = express();

  app.use(cors());
  // Job descriptions may carry a PDF (max 5 MB, base64); every other route keeps the 100 KB default.
  app.use('/api/v1/job-descriptions', express.json({ limit: '8mb' }));
  app.use(express.json());

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/me', meRouter);
  app.use('/api/v1/profile', profileRouter);
  app.use('/api/v1/skills', skillsRouter);
  app.use('/api/v1/job-descriptions', jobDescriptionsRouter);
  app.use('/api/v1/cvs', cvsRouter);
  app.use('/api/v1/regions', regionsRouter);
  app.use('/api/v1/job-sources', jobSourcesRouter);
  app.use('/api/v1/research', researchRouter);
  app.use('/api/v1/admin', adminRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
