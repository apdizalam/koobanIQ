import { isEmployerType } from '../../models/JobSource.js';
import { isRegionKey } from '../../models/Region.js';
import type { NormalizedJob } from './types.js';

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** A real apply link: an absolute http(s) URL. */
export function isApplyUrl(value: unknown): boolean {
  if (!nonEmpty(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Keeps only jobs with every required field (doc 9 §6: sourceKey, externalId,
 * title, employer, region and a real apply link) that really came from `sourceKey`.
 * Anything else is dropped and counted, never stored or shown (no invented jobs).
 */
export function keepValidJobs(sourceKey: string, jobs: unknown[]) {
  const valid: NormalizedJob[] = [];
  let invalid = 0;
  for (const job of jobs) {
    const j = job as Partial<NormalizedJob> | null;
    const ok =
      !!j &&
      j.sourceKey === sourceKey &&
      nonEmpty(j.externalId) &&
      nonEmpty(j.title) &&
      nonEmpty(j.employer) &&
      isEmployerType(j.employerType) &&
      isRegionKey(j.region) &&
      isApplyUrl(j.applyUrl);
    if (ok) valid.push(j as NormalizedJob);
    else invalid += 1;
  }
  return { valid, invalid };
}
