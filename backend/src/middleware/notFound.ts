import type { Request, Response } from 'express';
import { sendError } from './errorHandler.js';

/** Fallback for unknown routes: the standard { data, error, meta } envelope with 404. */
export function notFound(req: Request, res: Response) {
  sendError(req, res, 404, 'NOT_FOUND', 'Route not found');
}
