import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/** Skill levels, lowest first (design "05 · Skill profile": Mid · Advanced · Expert). */
export const SKILL_LEVELS = ['beginner', 'mid', 'advanced', 'expert'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export const isSkillLevel = (value: unknown): value is SkillLevel =>
  typeof value === 'string' && (SKILL_LEVELS as readonly string[]).includes(value);

/** Same skill however it is typed: "React", " react " → "react". */
export const skillKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * `skills` collection (architecture doc §7, TIQ-12). Two levels that are never
 * mixed up (PRD FR-SKL, product rule "knowledge, not experience"):
 * - selfLevel: what the user says; only the user changes it.
 * - assessedLevel: what a test showed; only an assessment (TIQ-13) sets it,
 *   together with lastAssessedAt and gaps.
 * One skill per name per user: unique (userId, key).
 */
const skillSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    /** Lower-case name, for the unique check. */
    key: { type: String, required: true },
    /** Optional group shown on the skill profile, e.g. "Frontend". */
    category: String,
    selfLevel: { type: String, enum: SKILL_LEVELS, required: true },
    assessedLevel: { type: String, enum: SKILL_LEVELS },
    yearsExp: Number,
    lastAssessedAt: Date,
    /** Topics a test found missing for this skill. */
    gaps: { type: [String], default: [] },
  },
  { timestamps: true },
);

skillSchema.index({ userId: 1, key: 1 }, { unique: true });

export type SkillDocument = HydratedDocument<InferSchemaType<typeof skillSchema>>;
export const Skill = model('Skill', skillSchema);

/** Both levels are always present in answers, separately (null when not assessed). */
export function toPublicSkill(skill: SkillDocument) {
  return {
    id: String(skill._id),
    name: skill.name,
    category: skill.category ?? null,
    selfLevel: skill.selfLevel,
    assessedLevel: skill.assessedLevel ?? null,
    yearsExp: skill.yearsExp ?? null,
    lastAssessedAt: skill.lastAssessedAt ?? null,
    gaps: skill.gaps,
    updatedAt: skill.updatedAt,
  };
}
