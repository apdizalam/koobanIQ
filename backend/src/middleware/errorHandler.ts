import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { sendAlert } from '../services/alertService.js';
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
  // Body bigger than the route allows (e.g. a PDF over the limit).
  if ((err as { type?: string } | null)?.type === 'entity.too.large') {
    sendError(req, res, 413, 'PAYLOAD_TOO_LARGE', 'The request is too large');
    return;
  }
  // Malformed JSON body sent by the client.
  if (err instanceof SyntaxError && 'body' in err) {
    sendError(req, res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
    return;
  }
  console.error(err);
  // The team hears about it (throttled; method, path and error only, never the body).
  const name = err instanceof Error ? err.name : typeof err;
  void sendAlert({
    kind: 'server_error',
    key: name,
    title: `Server error (500) on ${req.method} ${req.baseUrl}${req.path}`,
    lines: [
      `Error: ${name}: ${err instanceof Error ? err.message : String(err)}`,
      `Where: ${(err instanceof Error ? (err.stack ?? '') : '').split('\n').slice(1, 3).join(' | ')}`,
    ],
  });
  sendError(req, res, 500, 'INTERNAL_ERROR', 'Something went wrong');
}
