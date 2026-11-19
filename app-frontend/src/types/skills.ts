/** Skill levels, lowest first (backend models/Skill.ts; design 05: Mid · Advanced · Expert). */
export const SKILL_LEVELS = ['beginner', 'mid', 'advanced', 'expert'] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

/**
 * One skill from GET /api/v1/skills. Both levels are always separate:
 * selfLevel is what the user says, assessedLevel what a quiz showed (null until then).
 */
export interface Skill {
  id: string;
  name: string;
  category: string | null;
  selfLevel: SkillLevel;
  assessedLevel: SkillLevel | null;
  yearsExp: number | null;
  lastAssessedAt: string | null;
  gaps: string[];
}

export interface SkillCounts {
  total: number;
  assessed: number;
  selfReported: number;
}
