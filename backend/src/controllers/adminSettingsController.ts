import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { setTestAccount } from '../services/adminUserService.js';
import {
  getAiPersonalDataSetting,
  parseSettingChange,
  REASON_MAX,
  REASON_MIN,
  setAiPersonalData,
} from '../services/settingsService.js';

/** GET /api/v1/admin/settings/ai-personal-data (any admin may view). */
export async function getAiPersonalData(_req: Request, res: Response) {
  res.json({ data: { setting: await getAiPersonalDataSetting() }, error: null, meta: {} });
}

/** PUT /api/v1/admin/settings/ai-personal-data { value, reason } (admins; reason required). */
export async function putAiPersonalData(req: Request, res: Response) {
  const { value, reason } = parseSettingChange(req.body);
  res.json({
    data: { setting: await setAiPersonalData(req, value, reason) },
    error: null,
    meta: {},
  });
}

/** PATCH /api/v1/admin/users/:id/test-account { testAccount, reason } (admins; reason required). */
export async function patchTestAccount(req: Request, res: Response) {
  const b = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  for (const key of Object.keys(b)) {
    if (key !== 'testAccount' && key !== 'reason') details[key] = 'fieldNotEditable';
  }
  if (typeof b.testAccount !== 'boolean') details.testAccount = 'enabledInvalid';
  const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) details.reason = 'reasonRequired';
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  const user = await setTestAccount(req, String(req.params.id), b.testAccount as boolean, reason);
  res.json({ data: { user }, error: null, meta: {} });
}
