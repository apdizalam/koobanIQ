import { Schema, model, type InferSchemaType } from 'mongoose';

/** One change of a setting: who, when, from what, to what, and why. */
const changeSchema = new Schema(
  {
    value: { type: String, required: true },
    previous: { type: String, required: true },
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * `settings` collection: system settings managed in the Admin Dashboard. Each
 * document keeps its full change history, written in the same update as the
 * change itself (so no change can happen without its record).
 */
const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: String, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: String,
    history: { type: [changeSchema], default: [] },
  },
  { timestamps: true },
);

export type SettingFields = InferSchemaType<typeof settingSchema>;
export const Setting = model('Setting', settingSchema);

/** May AI features send real users' profile data (CVs) to the AI provider? */
export const AI_PERSONAL_DATA_KEY = 'ai_personal_data';
export const AI_PERSONAL_DATA_VALUES = ['blocked', 'allowed'] as const;
export type AiPersonalDataValue = (typeof AI_PERSONAL_DATA_VALUES)[number];
/** No stored setting = BLOCKED (owner decision: blocked until a paid tier is verified). */
export const AI_PERSONAL_DATA_DEFAULT: AiPersonalDataValue = 'blocked';
