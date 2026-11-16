import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/me', meRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
