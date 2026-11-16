import express from 'express';
import cors from 'cors';
import { notFound } from './middleware/notFound.js';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/v1/health', healthRouter);

  app.use(notFound);

  return app;
}
