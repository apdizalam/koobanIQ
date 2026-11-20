import { AppError } from './errors.js';
import { EMPLOYER_TYPES } from '../models/JobSource.js';
import { JOB_TYPES } from '../models/Profile.js';
import { REGION_KEYS, type RegionKey } from '../models/Region.js';
import type { StoredJobSearch } from '../services/jobMatchService.js';

const list = (value: unknown) =>
  typeof value === 'string' && value.trim()
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : [];

/** Query of GET /jobs/search: q, regions, city, employerTypes, jobTypes (comma lists), lower=1. */
export function parseJobSearch(query: Record<string, unknown>): StoredJobSearch {
  const details: Record<string, string> = {};
  const q = typeof query.q === 'string' ? query.q.trim() : '';
  if (q.length > 100) details.q = 'textTooLong';
  const city = typeof query.city === 'string' ? query.city.trim() : '';
  if (city.length > 60) details.city = 'textTooLong';
  const regions = list(query.regions);
  if (!regions.every((r) => (REGION_KEYS as readonly string[]).includes(r))) {
    details.regions = 'regionInvalid';
  }
  const employerTypes = list(query.employerTypes);
  if (!employerTypes.every((t) => (EMPLOYER_TYPES as readonly string[]).includes(t))) {
    details.employerTypes = 'employerTypeInvalid';
  }
  const jobTypes = list(query.jobTypes);
  if (!jobTypes.every((t) => (JOB_TYPES as readonly string[]).includes(t))) {
    details.jobTypes = 'choiceInvalid';
  }
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  return {
    q: q || undefined,
    regions: regions as RegionKey[],
    city: city || undefined,
    employerTypes,
    jobTypes,
    includeLower: query.lower === '1' || query.lower === 'true',
  };
}
