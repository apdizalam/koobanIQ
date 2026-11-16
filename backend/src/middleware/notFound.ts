import type { Request, Response } from 'express';

/** Fallback for unknown routes: the standard { data, error, meta } envelope with 404. */
export function notFound(_req: Request, res: Response) {
  res.status(404).json({
    data: null,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
    meta: {},
  });
}
