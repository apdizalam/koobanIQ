/** AI personal-data setting values (backend models/Setting.ts). Default: blocked. */
export const AI_PERSONAL_DATA_VALUES = ['blocked', 'allowed'] as const;
export type AiPersonalDataValue = (typeof AI_PERSONAL_DATA_VALUES)[number];

/** One recorded change, newest first (backend services/settingsService.ts). */
export interface SettingChange {
  value: AiPersonalDataValue;
  previous: AiPersonalDataValue;
  /** The admin's email (or id when the account no longer exists). */
  admin: string;
  adminId: string;
  reason: string;
  at: string;
}

/** GET /api/v1/admin/settings/ai-personal-data → data.setting */
export interface AiPersonalDataSetting {
  value: AiPersonalDataValue;
  /** True while nothing was ever stored (the default, BLOCKED). */
  isDefault: boolean;
  history: SettingChange[];
}
