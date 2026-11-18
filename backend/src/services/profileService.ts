import type { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { checkDateOrder, isItemId } from '../lib/validateProfile.js';
import { Profile, toPublicProfile, type ProfileSection } from '../models/Profile.js';

/** Most items in one list section (experience, education, ...). */
export const SECTION_MAX_ITEMS = 50;

/**
 * The signed-in user's profile, created empty the first time. Always looked up
 * by the user's own id, so nobody can reach another user's profile.
 */
async function ownProfile(userId: Types.ObjectId) {
  return Profile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).orFail();
}

/** Writes changed fields onto a (sub)document; `null` clears a field. */
function apply(
  target: { set(path: string, value: unknown): void },
  values: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(values)) {
    target.set(key, value === null ? undefined : value);
  }
}

/** One item of a list section, only from this user's own profile. */
function findItem(
  profile: Awaited<ReturnType<typeof ownProfile>>,
  section: ProfileSection,
  itemId: unknown,
) {
  const list = profile[section] as unknown as { id(id: string): unknown };
  const found = isItemId(itemId) ? list.id(itemId) : null;
  if (!found) throw new AppError(404, 'PROFILE_ITEM_NOT_FOUND', 'Profile item not found');
  return found as {
    set(path: string, value: unknown): void;
    toObject(): Record<string, unknown>;
    deleteOne(): void;
  };
}

/** GET /profile */
export async function getProfile(userId: Types.ObjectId) {
  return toPublicProfile(await ownProfile(userId));
}

/** PATCH /profile/personal: only the fields sent change. */
export async function updatePersonal(userId: Types.ObjectId, values: Record<string, unknown>) {
  const profile = await ownProfile(userId);
  apply({ set: (key, value) => profile.set(`personal.${key}`, value) }, values);
  await profile.save();
  return toPublicProfile(profile);
}

/** PUT /profile/preferences: replaces the lists sent. */
export async function updatePreferences(userId: Types.ObjectId, values: Record<string, unknown>) {
  const profile = await ownProfile(userId);
  apply({ set: (key, value) => profile.set(`preferences.${key}`, value ?? []) }, values);
  await profile.save();
  return toPublicProfile(profile);
}

/** POST /profile/:section */
export async function addItem(
  userId: Types.ObjectId,
  section: ProfileSection,
  values: Record<string, unknown>,
) {
  checkDateOrder(section, values);
  const profile = await ownProfile(userId);
  const list = profile[section] as unknown as { length: number; push(v: unknown): number };
  if (list.length >= SECTION_MAX_ITEMS) {
    throw new AppError(409, 'PROFILE_SECTION_FULL', 'This section has too many items');
  }
  list.push(Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null)));
  await profile.save();
  return toPublicProfile(profile);
}

/** PATCH /profile/:section/:itemId */
export async function updateItem(
  userId: Types.ObjectId,
  section: ProfileSection,
  itemId: unknown,
  values: Record<string, unknown>,
) {
  const profile = await ownProfile(userId);
  const found = findItem(profile, section, itemId);
  checkDateOrder(section, { ...found.toObject(), ...values });
  apply(found, values);
  await profile.save();
  return toPublicProfile(profile);
}

/** DELETE /profile/:section/:itemId */
export async function removeItem(userId: Types.ObjectId, section: ProfileSection, itemId: unknown) {
  const profile = await ownProfile(userId);
  findItem(profile, section, itemId).deleteOne();
  await profile.save();
  return toPublicProfile(profile);
}

/** Deleting an account deletes its profile too. */
export async function deleteProfile(userId: Types.ObjectId) {
  await Profile.deleteOne({ userId });
}
