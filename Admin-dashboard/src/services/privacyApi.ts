import type { AuthState } from '../auth/authContext';
import type { AdminUser } from '../types/adminUsers';
import type { AiPersonalDataSetting, AiPersonalDataValue } from '../types/privacy';

type Request = AuthState['request'];

/** Same limits as the backend (services/settingsService.ts parseSettingChange). */
export const REASON_MIN = 10;
export const REASON_MAX = 500;

export const fetchAiPersonalData = async (request: Request) =>
  (await request<{ setting: AiPersonalDataSetting }>('/admin/settings/ai-personal-data')).setting;

/** PUT the new value with the admin's reason; the server records who, when and why. */
export const updateAiPersonalData = async (
  request: Request,
  value: AiPersonalDataValue,
  reason: string,
) =>
  (
    await request<{ setting: AiPersonalDataSetting }>('/admin/settings/ai-personal-data', {
      method: 'PUT',
      body: { value, reason: reason.trim() },
    })
  ).setting;

/** Mark or unmark a test account (fictional data) with the admin's reason. */
export const updateTestAccount = async (
  request: Request,
  id: string,
  testAccount: boolean,
  reason: string,
) =>
  (
    await request<{ user: AdminUser }>(`/admin/users/${encodeURIComponent(id)}/test-account`, {
      method: 'PATCH',
      body: { testAccount, reason: reason.trim() },
    })
  ).user;

/** The only change an admin can make: switch to the other value. */
export const otherValue = (value: AiPersonalDataValue): AiPersonalDataValue =>
  value === 'blocked' ? 'allowed' : 'blocked';

/** Why a typed reason would be refused (same rule as the server), or null when it is fine. */
export function reasonProblem(text: string): 'tooShort' | 'tooLong' | null {
  const length = text.trim().length;
  if (length < REASON_MIN) return 'tooShort';
  if (length > REASON_MAX) return 'tooLong';
  return null;
}
