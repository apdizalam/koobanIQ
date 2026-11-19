import type { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { isItemId } from '../lib/validateProfile.js';
import { Skill, skillKey, toPublicSkill, type SkillLevel } from '../models/Skill.js';

/** Most skills one user can have. */
export const SKILLS_MAX = 100;

const isDuplicateKey = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

const duplicate = () =>
  new AppError(409, 'SKILL_EXISTS', 'You already have this skill. Edit it instead');

/** The user's own skill, or 404 (another user's skill id is "not found" too). */
async function ownSkill(userId: Types.ObjectId, id: unknown) {
  const skill = isItemId(id) ? await Skill.findOne({ _id: id, userId }) : null;
  if (!skill) throw new AppError(404, 'SKILL_NOT_FOUND', 'Skill not found');
  return skill;
}

/** GET /skills: sorted by name, with counts for the skill profile (assessed / self-reported). */
export async function listSkills(userId: Types.ObjectId) {
  const skills = await Skill.find({ userId }).sort({ key: 1 });
  return {
    skills: skills.map(toPublicSkill),
    counts: {
      total: skills.length,
      assessed: skills.filter((s) => s.assessedLevel).length,
      selfReported: skills.filter((s) => !s.assessedLevel).length,
    },
  };
}

/** POST /skills. The same name twice (any letter case) is refused. */
export async function addSkill(userId: Types.ObjectId, values: Record<string, unknown>) {
  if ((await Skill.countDocuments({ userId })) >= SKILLS_MAX) {
    throw new AppError(409, 'SKILLS_FULL', 'You have the most skills allowed. Remove one first');
  }
  const name = String(values.name).replace(/\s+/g, ' ');
  try {
    const skill = await Skill.create({
      userId,
      name,
      key: skillKey(name),
      selfLevel: values.selfLevel as SkillLevel,
      // Values were checked by parseFields; null / missing means "not given".
      category: typeof values.category === 'string' ? values.category : undefined,
      yearsExp: typeof values.yearsExp === 'number' ? values.yearsExp : undefined,
    });
    return toPublicSkill(skill);
  } catch (err) {
    // The unique index also catches two adds at the same moment.
    if (isDuplicateKey(err)) throw duplicate();
    throw err;
  }
}

/**
 * PATCH /skills/:id: the user's own fields only (name, category, selfLevel,
 * yearsExp). assessedLevel, lastAssessedAt and gaps can't be sent here.
 */
export async function updateSkill(
  userId: Types.ObjectId,
  id: unknown,
  values: Record<string, unknown>,
) {
  const skill = await ownSkill(userId, id);
  for (const [field, value] of Object.entries(values)) {
    if (field === 'name') {
      const name = String(value).replace(/\s+/g, ' ');
      skill.name = name;
      skill.key = skillKey(name);
    } else {
      skill.set(field, value === null ? undefined : value);
    }
  }
  try {
    await skill.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw duplicate();
    throw err;
  }
  return toPublicSkill(skill);
}

/** DELETE /skills/:id */
export async function removeSkill(userId: Types.ObjectId, id: unknown) {
  const skill = await ownSkill(userId, id);
  await skill.deleteOne();
}

/**
 * For assessments (TIQ-13) only, never reachable from a request body: records
 * what a test showed. Leaves selfLevel exactly as the user set it.
 */
export async function recordAssessment(
  userId: Types.ObjectId,
  skillId: unknown,
  result: { level: SkillLevel; gaps: string[]; at?: Date },
) {
  const skill = await ownSkill(userId, skillId);
  skill.assessedLevel = result.level;
  skill.gaps = result.gaps;
  skill.lastAssessedAt = result.at ?? new Date();
  await skill.save();
  return toPublicSkill(skill);
}

/** Deleting an account deletes its skills too. */
export async function deleteSkills(userId: Types.ObjectId) {
  await Skill.deleteMany({ userId });
}
