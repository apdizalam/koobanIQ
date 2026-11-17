import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { LANGUAGES, toPublicUser, type Language } from '../models/User.js';

/** GET /api/v1/me: the signed-in user's account. */
export function getMe(req: Request, res: Response) {
  res.json({ data: { user: toPublicUser(req.user!) }, error: null, meta: {} });
}

/**
 * PATCH /api/v1/me: change your own settings. For now only
 * `preferredLanguage` ("en" | "so"); other fields are refused, so a user can
 * never change their own role or status here.
 */
export async function updateMe(req: Request, res: Response) {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const unknownFields = Object.keys(body).filter((key) => key !== 'preferredLanguage');
  const details: Record<string, string> = {};
  for (const key of unknownFields) details[key] = 'This field cannot be changed here';
  if (!('preferredLanguage' in body) && unknownFields.length === 0) {
    details.preferredLanguage = 'Nothing to update';
  } else if (
    'preferredLanguage' in body &&
    !(LANGUAGES as readonly unknown[]).includes(body.preferredLanguage)
  ) {
    details.preferredLanguage = 'Must be "en" or "so"';
  }
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }

  const user = req.user!;
  user.preferredLanguage = body.preferredLanguage as Language;
  await user.save();
  res.json({ data: { user: toPublicUser(user) }, error: null, meta: {} });
}
