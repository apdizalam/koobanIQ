import type { Preferences, Profile, ProfileSection } from '../types/profile';
import { apiRequest } from './api';

type Answer = Promise<{ profile: Profile }>;

/** GET /profile: the signed-in user's own profile (created empty the first time). */
export const fetchProfile = (accessToken: string): Answer =>
  apiRequest('/profile', { accessToken });

/** PATCH /profile/personal: only the fields sent change; null clears one. */
export const savePersonal = (accessToken: string, values: Record<string, unknown>): Answer =>
  apiRequest('/profile/personal', { method: 'PATCH', accessToken, body: values });

/** PUT /profile/preferences: replaces the lists sent. */
export const savePreferences = (accessToken: string, values: Partial<Preferences>): Answer =>
  apiRequest('/profile/preferences', { method: 'PUT', accessToken, body: values });

/** POST /profile/:section */
export const addProfileItem = (
  accessToken: string,
  section: ProfileSection,
  values: Record<string, unknown>,
): Answer => apiRequest(`/profile/${section}`, { method: 'POST', accessToken, body: values });

/** PATCH /profile/:section/:id */
export const updateProfileItem = (
  accessToken: string,
  section: ProfileSection,
  id: string,
  values: Record<string, unknown>,
): Answer =>
  apiRequest(`/profile/${section}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    accessToken,
    body: values,
  });

/** DELETE /profile/:section/:id */
export const deleteProfileItem = (
  accessToken: string,
  section: ProfileSection,
  id: string,
): Answer =>
  apiRequest(`/profile/${section}/${encodeURIComponent(id)}`, { method: 'DELETE', accessToken });
