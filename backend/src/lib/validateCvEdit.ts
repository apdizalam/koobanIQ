import { AppError } from './errors.js';

/** Same limits as the AI's answer (ai/schemas/cv.ts). */
export const CV_EDIT_LIMITS = {
  headline: 120,
  summary: 800,
  bullet: 300,
  experienceBullets: 6,
  projectBullets: 4,
} as const;

export interface CvEdit {
  headline?: string;
  summary?: string;
  experience?: { id: string; bullets: string[] }[];
  projects?: { id: string; bullets: string[] }[];
}

type Entry = { id: string };

/**
 * PATCH /cvs/:id body (TIQ-10, owner decision: wording only). The user may
 * change the headline, the summary and the bullet points of entries already in
 * the CV; facts (names, employers, dates, schools, skills, languages) stay as
 * copied from the profile and are refused here. Throws 400 with a message per field.
 */
export function parseCvEdit(
  body: unknown,
  current: { experience: Entry[]; projects: Entry[] },
): CvEdit {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  const edit: CvEdit = {};

  for (const key of Object.keys(b)) {
    if (!['headline', 'summary', 'experience', 'projects'].includes(key)) {
      details[key] = 'fieldNotEditable';
    }
  }

  const text = (key: 'headline' | 'summary') => {
    if (b[key] === undefined) return;
    const value = typeof b[key] === 'string' ? (b[key] as string).trim() : null;
    if (!value) details[key] = 'required';
    else if (value.length > CV_EDIT_LIMITS[key]) details[key] = 'textTooLong';
    else edit[key] = value;
  };
  text('headline');
  text('summary');

  const bullets = (key: 'experience' | 'projects', max: number, known: Entry[]) => {
    if (b[key] === undefined) return;
    const ids = new Set(known.map((e) => e.id));
    const list = b[key];
    const seen = new Set<string>();
    const ok =
      Array.isArray(list) &&
      list.every((item) => {
        if (!item || typeof item !== 'object') return false;
        const { id, bullets: lines, ...rest } = item as Record<string, unknown>;
        if (Object.keys(rest).length > 0) return false; // e.g. "employer": facts are not editable
        if (typeof id !== 'string' || !ids.has(id) || seen.has(id)) return false;
        seen.add(id);
        return (
          Array.isArray(lines) &&
          lines.length <= max &&
          lines.every(
            (line) =>
              typeof line === 'string' &&
              line.trim().length > 0 &&
              line.trim().length <= CV_EDIT_LIMITS.bullet,
          )
        );
      });
    if (!ok) {
      details[key] = 'listInvalid';
      return;
    }
    edit[key] = (list as { id: string; bullets: string[] }[]).map((item) => ({
      id: item.id,
      bullets: item.bullets.map((line) => line.trim()),
    }));
  };
  bullets('experience', CV_EDIT_LIMITS.experienceBullets, current.experience);
  bullets('projects', CV_EDIT_LIMITS.projectBullets, current.projects);

  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  if (Object.keys(edit).length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', {
      body: 'nothingToUpdate',
    });
  }
  return edit;
}
