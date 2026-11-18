import { AppError } from './errors.js';
import { isEmployerType, type EmployerType } from '../models/JobSource.js';
import { isRegionKey, type RegionKey } from '../models/Region.js';
import type { SourceChanges } from '../services/jobSourceService.js';

// Field messages are keys under server.validation in the shared translation files.

const fail = (details: Record<string, string>) => {
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
};

/** `?regions=somaliland,somalia` (or repeated). Missing = no region filter. */
export function parseRegionsQuery(value: unknown): RegionKey[] | undefined {
  if (value === undefined || value === '') return undefined;
  const parts = (Array.isArray(value) ? value : [value])
    .flatMap((v) => String(v).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
  const details: Record<string, string> = {};
  if (parts.length === 0 || !parts.every(isRegionKey)) details.regions = 'regionInvalid';
  fail(details);
  return [...new Set(parts as RegionKey[])];
}

const EDITABLE_SOURCE_FIELDS = ['enabled', 'regions', 'employerTypes', 'priority'];

/** Body of PATCH /admin/job-sources/:key. Only these fields can be changed here. */
export function parseSourceChanges(body: unknown): SourceChanges {
  const b = (body ?? {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  const changes: SourceChanges = {};

  for (const field of Object.keys(b)) {
    if (!EDITABLE_SOURCE_FIELDS.includes(field)) details[field] = 'fieldNotEditable';
  }
  if (b.enabled !== undefined) {
    if (typeof b.enabled !== 'boolean') details.enabled = 'enabledInvalid';
    else changes.enabled = b.enabled;
  }
  if (b.regions !== undefined) {
    const ok = Array.isArray(b.regions) && b.regions.length > 0 && b.regions.every(isRegionKey);
    if (!ok) details.regions = 'regionInvalid';
    else changes.regions = [...new Set(b.regions as RegionKey[])];
  }
  if (b.employerTypes !== undefined) {
    const ok = Array.isArray(b.employerTypes) && b.employerTypes.every(isEmployerType);
    if (!ok) details.employerTypes = 'employerTypeInvalid';
    else changes.employerTypes = [...new Set(b.employerTypes as EmployerType[])];
  }
  if (b.priority !== undefined) {
    const ok =
      Number.isInteger(b.priority) && Number(b.priority) >= 0 && Number(b.priority) <= 1000;
    if (!ok) details.priority = 'priorityInvalid';
    else changes.priority = Number(b.priority);
  }
  if (Object.keys(b).length === 0) details.body = 'nothingToUpdate';
  fail(details);
  return changes;
}

const CITY_MAX_LENGTH = 60;
const CITIES_MAX = 100;

/** Body of PATCH /admin/regions/:key: `{ cities: string[] }` (trimmed, duplicates removed). */
export function parseRegionCities(body: unknown): string[] {
  const b = (body ?? {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  const cities = Array.isArray(b.cities)
    ? b.cities.map((c) => (typeof c === 'string' ? c.trim() : ''))
    : null;
  const ok =
    cities !== null &&
    cities.length <= CITIES_MAX &&
    cities.every((c) => c.length > 0 && c.length <= CITY_MAX_LENGTH);
  if (!ok) details.cities = 'citiesInvalid';
  fail(details);
  // Same city typed twice (any letter case) is kept once, first spelling wins.
  const seen = new Set<string>();
  return (cities ?? []).filter((c) => {
    const k = c.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** `:key` of /admin/regions/:key. */
export function parseRegionKey(value: unknown): RegionKey {
  const details: Record<string, string> = {};
  if (!isRegionKey(value)) details.region = 'regionInvalid';
  fail(details);
  return value as RegionKey;
}
