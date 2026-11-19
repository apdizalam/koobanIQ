import type { Request, Response } from 'express';
import { parseFields, type Rules } from '../lib/validateProfile.js';
import { SKILL_LEVELS } from '../models/Skill.js';
import { addSkill, listSkills, removeSkill, updateSkill } from '../services/skillService.js';

/**
 * What a user may send for a skill. assessedLevel, lastAssessedAt and gaps are
 * not here: only an assessment sets them, so sending them is refused.
 */
const SKILL_RULES: Rules = {
  name: { kind: 'text', max: 60, required: true },
  category: { kind: 'text', max: 40 },
  selfLevel: { kind: 'choice', values: SKILL_LEVELS, required: true },
  yearsExp: { kind: 'int', min: 0, max: 60 },
};

/** GET /api/v1/skills */
export async function getSkills(req: Request, res: Response) {
  res.json({ data: await listSkills(req.user!._id), error: null, meta: {} });
}

/** POST /api/v1/skills { name, selfLevel, category?, yearsExp? } */
export async function postSkill(req: Request, res: Response) {
  const values = parseFields(req.body, SKILL_RULES, 'create');
  const skill = await addSkill(req.user!._id, values);
  res.status(201).json({ data: { skill }, error: null, meta: {} });
}

/** PATCH /api/v1/skills/:id */
export async function patchSkill(req: Request, res: Response) {
  const values = parseFields(req.body, SKILL_RULES, 'update');
  const skill = await updateSkill(req.user!._id, req.params.id, values);
  res.json({ data: { skill }, error: null, meta: {} });
}

/** DELETE /api/v1/skills/:id */
export async function deleteSkill(req: Request, res: Response) {
  await removeSkill(req.user!._id, req.params.id);
  res.status(204).end();
}
