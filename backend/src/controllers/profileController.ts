import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import {
  PERSONAL_RULES,
  PREFERENCE_RULES,
  SECTION_RULES,
  parseFields,
} from '../lib/validateProfile.js';
import { isProfileSection, type ProfileSection } from '../models/Profile.js';
import {
  addItem,
  getProfile,
  removeItem,
  updateItem,
  updatePersonal,
  updatePreferences,
} from '../services/profileService.js';

const send = (res: Response, profile: unknown, status = 200) =>
  res.status(status).json({ data: { profile }, error: null, meta: {} });

/** `:section` must be one of the list sections. */
function sectionOf(req: Request): ProfileSection {
  const section = req.params.section;
  if (!isProfileSection(section)) {
    throw new AppError(404, 'PROFILE_ITEM_NOT_FOUND', 'Profile item not found');
  }
  return section;
}

/** GET /api/v1/profile: the signed-in user's own profile (created empty the first time). */
export async function getMyProfile(req: Request, res: Response) {
  send(res, await getProfile(req.user!._id));
}

/** PATCH /api/v1/profile/personal */
export async function patchPersonal(req: Request, res: Response) {
  const values = parseFields(req.body, PERSONAL_RULES, 'update');
  send(res, await updatePersonal(req.user!._id, values));
}

/** PUT /api/v1/profile/preferences */
export async function putPreferences(req: Request, res: Response) {
  const values = parseFields(req.body, PREFERENCE_RULES, 'update');
  send(res, await updatePreferences(req.user!._id, values));
}

/** POST /api/v1/profile/:section */
export async function postItem(req: Request, res: Response) {
  const section = sectionOf(req);
  const values = parseFields(req.body, SECTION_RULES[section], 'create');
  send(res, await addItem(req.user!._id, section, values), 201);
}

/** PATCH /api/v1/profile/:section/:itemId */
export async function patchItem(req: Request, res: Response) {
  const section = sectionOf(req);
  const values = parseFields(req.body, SECTION_RULES[section], 'update');
  send(res, await updateItem(req.user!._id, section, req.params.itemId, values));
}

/** DELETE /api/v1/profile/:section/:itemId */
export async function deleteItem(req: Request, res: Response) {
  const section = sectionOf(req);
  send(res, await removeItem(req.user!._id, section, req.params.itemId));
}
