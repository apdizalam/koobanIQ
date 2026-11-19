import {
  LANGUAGE_LEVELS,
  REGION_KEYS,
  type ProfileItem,
  type ProfileSection,
} from '../types/profile';

/**
 * How a profile field is edited. The server checks every value again
 * (backend lib/validateProfile.ts) and answers with messages in the app language.
 */
export type FieldKind =
  'text' | 'multiline' | 'month' | 'year' | 'url' | 'phone' | 'choice' | 'list';

export interface FieldDef {
  key: string;
  kind: FieldKind;
  required?: boolean;
  /** For `choice`: the values, and where their names live in the translations. */
  choices?: readonly string[];
  choiceLabels?: 'common.region' | 'mobile.profile.levels';
  maxLength?: number;
}

export const PERSONAL_FIELDS: FieldDef[] = [
  { key: 'fullName', kind: 'text', maxLength: 100 },
  { key: 'headline', kind: 'text', maxLength: 100 },
  { key: 'profession', kind: 'text', maxLength: 100 },
  { key: 'region', kind: 'choice', choices: REGION_KEYS, choiceLabels: 'common.region' },
  { key: 'city', kind: 'text', maxLength: 60 },
  { key: 'phone', kind: 'phone', maxLength: 20 },
  { key: 'summary', kind: 'multiline', maxLength: 1000 },
];

export const SECTION_FIELDS: Record<ProfileSection, FieldDef[]> = {
  experience: [
    { key: 'title', kind: 'text', required: true, maxLength: 100 },
    { key: 'employer', kind: 'text', required: true, maxLength: 100 },
    { key: 'city', kind: 'text', maxLength: 60 },
    { key: 'region', kind: 'choice', choices: REGION_KEYS, choiceLabels: 'common.region' },
    { key: 'startDate', kind: 'month', required: true },
    { key: 'endDate', kind: 'month' },
    { key: 'description', kind: 'multiline', maxLength: 2000 },
  ],
  education: [
    { key: 'school', kind: 'text', required: true, maxLength: 150 },
    { key: 'degree', kind: 'text', maxLength: 100 },
    { key: 'field', kind: 'text', maxLength: 100 },
    { key: 'startYear', kind: 'year' },
    { key: 'endYear', kind: 'year' },
  ],
  projects: [
    { key: 'name', kind: 'text', required: true, maxLength: 100 },
    { key: 'description', kind: 'multiline', maxLength: 1000 },
    { key: 'url', kind: 'url' },
    { key: 'skills', kind: 'list' },
  ],
  certifications: [
    { key: 'name', kind: 'text', required: true, maxLength: 150 },
    { key: 'issuer', kind: 'text', maxLength: 100 },
    { key: 'issuedOn', kind: 'month' },
    { key: 'url', kind: 'url' },
  ],
  languages: [
    { key: 'language', kind: 'text', required: true, maxLength: 60 },
    {
      key: 'level',
      kind: 'choice',
      required: true,
      choices: LANGUAGE_LEVELS,
      choiceLabels: 'mobile.profile.levels',
    },
  ],
};

/** Form text for a stored value (lists become "a, b", numbers become text). */
export function toFormText(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === undefined || value === null) return '';
  return String(value);
}

/**
 * Form text → what the API expects. Empty → null (clears the field), years →
 * numbers (or the text, so the server can say it's not a year), lists → arrays.
 */
export function toApiValue(field: FieldDef, text: string): unknown {
  const trimmed = text.trim();
  if (field.kind === 'list') {
    return trimmed
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (trimmed === '') return null;
  if (field.kind === 'year') return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
  return trimmed;
}

/**
 * The body to send. New entries leave out empty fields; edits send every field
 * so a cleared one is removed on the server.
 */
export function formBody(
  fields: FieldDef[],
  texts: Record<string, string>,
  mode: 'create' | 'update',
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of fields) {
    const value = toApiValue(field, texts[field.key] ?? '');
    const empty = value === null || (Array.isArray(value) && value.length === 0);
    if (mode === 'create' && empty) continue;
    body[field.key] = value;
  }
  return body;
}

/** Two short lines that describe one entry in a list. */
export function itemSummary(
  section: ProfileSection,
  item: ProfileItem,
  words: { now: string; level: (level: string) => string },
): { title: string; detail: string } {
  const join = (...parts: unknown[]) =>
    parts.filter((p) => p !== undefined && p !== '').join(' · ');
  switch (section) {
    case 'experience':
      return {
        title: String(item.title ?? ''),
        detail: join(item.employer, `${item.startDate ?? ''} – ${item.endDate ?? words.now}`),
      };
    case 'education':
      return {
        title: String(item.school ?? ''),
        detail: join(
          item.degree,
          item.field,
          item.startYear || item.endYear ? `${item.startYear ?? ''}–${item.endYear ?? ''}` : '',
        ),
      };
    case 'projects':
      return { title: String(item.name ?? ''), detail: join(item.url) };
    case 'certifications':
      return { title: String(item.name ?? ''), detail: join(item.issuer, item.issuedOn) };
    case 'languages':
      return { title: String(item.language ?? ''), detail: words.level(String(item.level ?? '')) };
  }
}
