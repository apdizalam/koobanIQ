import { AppError } from './errors.js';
import { EMPLOYER_TYPES } from '../models/JobSource.js';
import { JOB_TYPES, LANGUAGE_LEVELS, WORK_MODES, type ProfileSection } from '../models/Profile.js';
import { REGION_KEYS } from '../models/Region.js';

// Field messages are keys under server.validation in the shared translation files.

type Field =
  | { kind: 'text'; max: number; required?: boolean; pattern?: RegExp }
  | { kind: 'choice'; values: readonly string[]; required?: boolean }
  | { kind: 'month'; required?: boolean }
  | { kind: 'year' }
  | { kind: 'int'; min: number; max: number }
  | { kind: 'url' }
  | { kind: 'list'; values?: readonly string[]; maxItems: number; itemMax?: number };

export type Rules = Record<string, Field>;

const MONTH_RE = /^(19[5-9]\d|20\d\d|2100)-(0[1-9]|1[0-2])$/;
const PHONE_RE = /^\+?[\d\s-]{6,20}$/;
const YEAR_MIN = 1950;
const YEAR_MAX = 2100;

export const PERSONAL_RULES: Rules = {
  fullName: { kind: 'text', max: 100 },
  headline: { kind: 'text', max: 100 },
  profession: { kind: 'text', max: 100 },
  region: { kind: 'choice', values: REGION_KEYS },
  city: { kind: 'text', max: 60 },
  phone: { kind: 'text', max: 20, pattern: PHONE_RE },
  summary: { kind: 'text', max: 1000 },
};

export const SECTION_RULES: Record<ProfileSection, Rules> = {
  experience: {
    title: { kind: 'text', max: 100, required: true },
    employer: { kind: 'text', max: 100, required: true },
    city: { kind: 'text', max: 60 },
    region: { kind: 'choice', values: REGION_KEYS },
    startDate: { kind: 'month', required: true },
    endDate: { kind: 'month' },
    description: { kind: 'text', max: 2000 },
  },
  education: {
    school: { kind: 'text', max: 150, required: true },
    degree: { kind: 'text', max: 100 },
    field: { kind: 'text', max: 100 },
    startYear: { kind: 'year' },
    endYear: { kind: 'year' },
  },
  projects: {
    name: { kind: 'text', max: 100, required: true },
    description: { kind: 'text', max: 1000 },
    url: { kind: 'url' },
    skills: { kind: 'list', maxItems: 20, itemMax: 40 },
  },
  certifications: {
    name: { kind: 'text', max: 150, required: true },
    issuer: { kind: 'text', max: 100 },
    issuedOn: { kind: 'month' },
    url: { kind: 'url' },
  },
  languages: {
    language: { kind: 'text', max: 60, required: true },
    level: { kind: 'choice', values: LANGUAGE_LEVELS, required: true },
  },
};

export const PREFERENCE_RULES: Rules = {
  titles: { kind: 'list', maxItems: 10, itemMax: 100 },
  regions: { kind: 'list', values: REGION_KEYS, maxItems: REGION_KEYS.length },
  cities: { kind: 'list', maxItems: 20, itemMax: 60 },
  employerTypes: { kind: 'list', values: EMPLOYER_TYPES, maxItems: EMPLOYER_TYPES.length },
  workModes: { kind: 'list', values: WORK_MODES, maxItems: WORK_MODES.length },
  jobTypes: { kind: 'list', values: JOB_TYPES, maxItems: JOB_TYPES.length },
};

/** A value the user cleared: null, or text that is only spaces. */
const isEmpty = (v: unknown) => v === null || (typeof v === 'string' && v.trim() === '');

function isUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Checks one field. Returns the cleaned value, or a server.validation key.
 * `null` means "clear this field".
 */
function check(field: Field, raw: unknown): { value: unknown } | { error: string } {
  if (isEmpty(raw)) {
    if ('required' in field && field.required) return { error: 'required' };
    return { value: field.kind === 'list' ? [] : null };
  }
  switch (field.kind) {
    case 'text': {
      if (typeof raw !== 'string') return { error: 'textInvalid' };
      const text = raw.trim();
      if (text.length > field.max) return { error: 'textTooLong' };
      if (field.pattern && !field.pattern.test(text)) return { error: 'phoneInvalid' };
      return { value: text };
    }
    case 'choice':
      return field.values.includes(raw as string) ? { value: raw } : { error: 'choiceInvalid' };
    case 'month':
      return typeof raw === 'string' && MONTH_RE.test(raw)
        ? { value: raw }
        : { error: 'monthInvalid' };
    case 'year':
      return Number.isInteger(raw) && Number(raw) >= YEAR_MIN && Number(raw) <= YEAR_MAX
        ? { value: raw }
        : { error: 'yearInvalid' };
    case 'int':
      return Number.isInteger(raw) && Number(raw) >= field.min && Number(raw) <= field.max
        ? { value: raw }
        : { error: 'numberInvalid' };
    case 'url':
      return typeof raw === 'string' && raw.length <= 300 && isUrl(raw.trim())
        ? { value: raw.trim() }
        : { error: 'urlInvalid' };
    case 'list': {
      if (!Array.isArray(raw) || raw.length > field.maxItems) return { error: 'listInvalid' };
      const items = raw.map((v) => (typeof v === 'string' ? v.trim() : ''));
      const ok = items.every(
        (v) =>
          v.length > 0 &&
          (field.values ? field.values.includes(v) : v.length <= (field.itemMax ?? 100)),
      );
      if (!ok) return { error: 'listInvalid' };
      // Same entry twice (any letter case) is kept once.
      const seen = new Set<string>();
      return {
        value: items.filter((v) => !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase())),
      };
    }
  }
}

const fail = (details: Record<string, string>) => {
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
};

/**
 * Checks a request body against `rules`.
 * - create: every required field must be there.
 * - update: only the fields sent are changed; at least one field is needed.
 * Unknown fields are refused. Returns the cleaned values (`null` = clear).
 */
export function parseFields(
  body: unknown,
  rules: Rules,
  mode: 'create' | 'update',
): Record<string, unknown> {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<
    string,
    unknown
  >;
  const details: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const key of Object.keys(b)) {
    if (!(key in rules)) details[key] = 'fieldNotEditable';
  }
  for (const [key, field] of Object.entries(rules)) {
    if (!(key in b)) {
      if (mode === 'create' && 'required' in field && field.required) details[key] = 'required';
      continue;
    }
    const result = check(field, b[key]);
    if ('error' in result) details[key] = result.error;
    else values[key] = result.value;
  }
  if (mode === 'update' && Object.keys(b).length === 0) details.body = 'nothingToUpdate';
  fail(details);
  return values;
}

/** Start must not be after end (experience months, education years). */
export function checkDateOrder(section: ProfileSection, item: Record<string, unknown>) {
  const details: Record<string, string> = {};
  if (section === 'experience' && item.startDate && item.endDate) {
    if (String(item.endDate) < String(item.startDate)) details.endDate = 'dateOrderInvalid';
  }
  if (section === 'education' && item.startYear && item.endYear) {
    if (Number(item.endYear) < Number(item.startYear)) details.endYear = 'dateOrderInvalid';
  }
  fail(details);
}

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

/** `:itemId`: anything that isn't an id simply isn't found (404), like someone else's id. */
export const isItemId = (value: unknown): value is string =>
  typeof value === 'string' && OBJECT_ID_RE.test(value);
