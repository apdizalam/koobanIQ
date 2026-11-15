import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use('/api/v1/health', healthRouter);

  app.use((_req, res) => {
    res.status(404).json({
      data: null,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
      meta: {},
    });
  });

  return app;
}
