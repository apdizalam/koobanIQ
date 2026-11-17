import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { requestLanguage, translate } from '../lib/i18n.js';
import { PASSWORD_MAX, PASSWORD_MIN } from '../lib/validate.js';

/** Values the field messages can mention, e.g. "at least {{min}} characters". */
const FIELD_VARS = { min: PASSWORD_MIN, max: PASSWORD_MAX };

/** Sends the standard error envelope with the message in the request's language. */
export function sendError(
  req: Request,
  res: Response,
  status: number,
  code: string,
  fallback: string,
  details?: Record<string, string>,
) {
  const language = requestLanguage(req);
  const message = translate(language, `server.errors.${code}`) ?? fallback;
  const fields = details
    ? Object.fromEntries(
        Object.entries(details).map(([field, key]) => [
          field,
          translate(language, `server.validation.${key}`, FIELD_VARS) ?? key,
        ]),
      )
    : undefined;
  res.status(status).json({
    data: null,
    error: { code, message },
    meta: fields ? { details: fields } : {},
  });
}

/**
 * Central error handler: every error leaves the API in the standard envelope,
 * translated into the user's saved language or the Accept-Language header.
 * The `code` never changes with the language, so apps can rely on it.
 */
// Express recognises an error handler by its 4 parameters, so `_next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    sendError(req, res, err.status, err.code, err.message, err.details);
    return;
  }
  // Malformed JSON body sent by the client.
  if (err instanceof SyntaxError && 'body' in err) {
    sendError(req, res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
    return;
  }
  console.error(err);
  sendError(req, res, 500, 'INTERNAL_ERROR', 'Something went wrong');
}
