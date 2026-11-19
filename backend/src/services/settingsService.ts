import type { Request } from 'express';
import { AppError } from '../lib/errors.js';
import {
  AI_PERSONAL_DATA_DEFAULT,
  AI_PERSONAL_DATA_KEY,
  AI_PERSONAL_DATA_VALUES,
  Setting,
  type AiPersonalDataValue,
} from '../models/Setting.js';
import { User } from '../models/User.js';
import { recordAudit } from './auditService.js';

export const REASON_MIN = 10;
export const REASON_MAX = 500;

/**
 * The AI personal-data setting as stored, read fresh on every call (a change
 * takes effect at once). No stored setting means BLOCKED.
 */
export async function aiPersonalDataValue(): Promise<AiPersonalDataValue> {
  const setting = await Setting.findOne({ key: AI_PERSONAL_DATA_KEY }).lean();
  return setting?.value === 'allowed' ? 'allowed' : AI_PERSONAL_DATA_DEFAULT;
}

/** GET /admin/settings/ai-personal-data: value, last change and history (newest first, with admin emails). */
export async function getAiPersonalDataSetting() {
  const setting = await Setting.findOne({ key: AI_PERSONAL_DATA_KEY }).lean();
  const history = [...(setting?.history ?? [])].reverse().slice(0, 50);
  const admins = await User.find(
    { _id: { $in: history.map((h) => h.adminId) } },
    { email: 1 },
  ).lean();
  const emailOf = new Map(admins.map((a) => [String(a._id), a.email]));
  return {
    value: setting?.value === 'allowed' ? 'allowed' : AI_PERSONAL_DATA_DEFAULT,
    isDefault: !setting,
    history: history.map((h) => ({
      value: h.value,
      previous: h.previous,
      admin: emailOf.get(String(h.adminId)) ?? String(h.adminId),
      adminId: String(h.adminId),
      reason: h.reason,
      at: h.at,
    })),
  };
}

/** Body of PUT /admin/settings/ai-personal-data: { value, reason }. */
export function parseSettingChange(body: unknown): { value: AiPersonalDataValue; reason: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  for (const key of Object.keys(b)) {
    if (key !== 'value' && key !== 'reason') details[key] = 'fieldNotEditable';
  }
  if (!(AI_PERSONAL_DATA_VALUES as readonly unknown[]).includes(b.value)) {
    details.value = 'choiceInvalid';
  }
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) details.reason = 'reasonRequired';
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  return { value: b.value as AiPersonalDataValue, reason };
}

/**
 * PUT /admin/settings/ai-personal-data (super admin only, checked by the
 * route). The value and its history entry (admin id, time, previous value,
 * reason) are written in one update; the audit log gets a record too.
 */
export async function setAiPersonalData(req: Request, value: AiPersonalDataValue, reason: string) {
  const previous = await aiPersonalDataValue();
  if (previous === value) {
    throw new AppError(409, 'SETTING_UNCHANGED', 'The setting already has this value');
  }
  const at = new Date();
  const adminId = req.user!._id;
  await Setting.updateOne(
    { key: AI_PERSONAL_DATA_KEY },
    {
      $set: { value, updatedBy: adminId, reason },
      $push: { history: { value, previous, adminId, reason, at } },
    },
    { upsert: true },
  );
  await recordAudit(req, {
    action: 'settings.ai_personal_data',
    targetType: 'setting',
    targetId: AI_PERSONAL_DATA_KEY,
    before: { value: previous },
    after: { value },
    reason,
  });
  return getAiPersonalDataSetting();
}
