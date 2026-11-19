import type { Skill, SkillCounts } from '../types/skills';
import { apiRequest } from './api';

/** GET /skills: the user's own skills (sorted by name) and the counts. */
export const fetchSkills = (accessToken: string) =>
  apiRequest<{ skills: Skill[]; counts: SkillCounts }>('/skills', { accessToken });

/** POST /skills { name, selfLevel, category?, yearsExp? } */
export const addSkill = (accessToken: string, values: Record<string, unknown>) =>
  apiRequest<{ skill: Skill }>('/skills', { method: 'POST', accessToken, body: values });

/** PATCH /skills/:id: only the user's own fields; the assessed level is never sent. */
export const updateSkill = (accessToken: string, id: string, values: Record<string, unknown>) =>
  apiRequest<{ skill: Skill }>(`/skills/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    accessToken,
    body: values,
  });

/** DELETE /skills/:id */
export const deleteSkill = (accessToken: string, id: string) =>
  apiRequest<void>(`/skills/${encodeURIComponent(id)}`, { method: 'DELETE', accessToken });
