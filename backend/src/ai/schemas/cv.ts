import { z } from 'zod';
import {
  mentions,
  profileText,
  skillsNotInProfile,
  type CvAiInput,
} from '../../services/cvFacts.js';

/** What the AI answers for a CV (TIQ-9): choices by id plus the wording it writes. */
export interface CvAnswer {
  headline: string;
  summary: string;
  skills: string[];
  experience: { id: string; bullets: string[] }[];
  education: { id: string }[];
  projects: { id: string; bullets: string[] }[];
  certifications: { id: string }[];
  languages: { id: string }[];
}

const line = (max: number) => z.string().trim().min(1).max(max);

/** Only these values are allowed; with none, the list must stay empty. */
function oneOf(values: string[]) {
  return values.length > 0
    ? z.enum(values as [string, ...string[]])
    : z.string().refine(() => false, 'nothing to choose from');
}
const listOf = <T extends z.ZodType>(item: T, values: string[], max: number) =>
  z.array(item).max(values.length === 0 ? 0 : max);

/** Numbers in a text ("3", "2024", "1.5", "50%"). */
const numbersIn = (text: string) => text.match(/\d+(?:[.,]\d+)?/g) ?? [];

/**
 * The answer schema for one user's CV. Built per request so the AI can only
 * pick that user's own entries (by id) and skills (by exact name). The checks
 * reject unsupported claims in the AI's own wording:
 * - a number that does not appear in the profile ("10 years", "50 staff"),
 * - a job skill the user does not have,
 * - the same entry twice.
 */
export function buildCvAnswerSchema(input: CvAiInput): z.ZodType<CvAnswer> {
  const p = input.profile;
  const ids = (list: { id: string }[]) => list.map((item) => item.id);
  const experienceIds = ids(p.experience);
  const educationIds = ids(p.education);
  const projectIds = ids(p.projects);
  const certificationIds = ids(p.certifications);
  const languageIds = ids(p.languages);
  const skillNames = p.skills.map((s) => s.name);

  const allowedNumbers = new Set(numbersIn(profileText(input)));
  const missingSkills = skillsNotInProfile(input, [
    ...input.target.requiredSkills,
    ...input.target.preferredSkills,
  ]);

  return z
    .object({
      headline: line(120),
      summary: line(800),
      skills: listOf(oneOf(skillNames), skillNames, 30),
      experience: listOf(
        z.object({ id: oneOf(experienceIds), bullets: z.array(line(300)).max(6) }).strict(),
        experienceIds,
        20,
      ),
      education: listOf(z.object({ id: oneOf(educationIds) }).strict(), educationIds, 10),
      projects: listOf(
        z.object({ id: oneOf(projectIds), bullets: z.array(line(300)).max(4) }).strict(),
        projectIds,
        10,
      ),
      certifications: listOf(
        z.object({ id: oneOf(certificationIds) }).strict(),
        certificationIds,
        15,
      ),
      languages: listOf(z.object({ id: oneOf(languageIds) }).strict(), languageIds, 10),
    })
    .strict()
    .superRefine((answer, ctx) => {
      for (const key of [
        'experience',
        'education',
        'projects',
        'certifications',
        'languages',
      ] as const) {
        const chosen = answer[key].map((item) => item.id);
        if (new Set(chosen).size !== chosen.length) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'same entry twice' });
        }
      }
      if (new Set(answer.skills).size !== answer.skills.length) {
        ctx.addIssue({ code: 'custom', path: ['skills'], message: 'same skill twice' });
      }

      const written = [
        answer.headline,
        answer.summary,
        ...answer.experience.flatMap((e) => e.bullets),
        ...answer.projects.flatMap((e) => e.bullets),
      ].join('\n');
      for (const value of numbersIn(written)) {
        if (!allowedNumbers.has(value)) {
          ctx.addIssue({
            code: 'custom',
            path: ['summary'],
            message: `number not in profile: ${value}`,
          });
        }
      }
      for (const skill of missingSkills) {
        if (mentions(written, skill)) {
          ctx.addIssue({
            code: 'custom',
            path: ['summary'],
            message: 'claims a skill not in the profile',
          });
        }
      }
    }) as unknown as z.ZodType<CvAnswer>;
}
