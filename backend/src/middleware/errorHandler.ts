import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

/** Central error handler: every error leaves the API in the standard envelope. */
// Express recognises an error handler by its 4 parameters, so `_next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({
      data: null,
      error: { code: err.code, message: err.message },
      meta: err.details ? { details: err.details } : {},
    });
    return;
  }
  // Malformed JSON body sent by the client.
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      data: null,
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' },
      meta: {},
    });
    return;
  }
  console.error(err);
  res.status(500).json({
    data: null,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    meta: {},
  });
}
