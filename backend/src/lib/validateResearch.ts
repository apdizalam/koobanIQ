import { AppError } from './errors.js';
import { checkUrlForm, UnsafeUrlError } from '../jobs/http.js';
import { CAREER_PAGES_KEY, MAX_CUSTOM_URLS } from '../jobs/sources/careerPages.js';
import { isEmployerType, type EmployerType } from '../models/JobSource.js';
import { isRegionKey, type RegionKey } from '../models/Region.js';
import type { ResearchRequest } from '../services/researchService.js';

// Field messages are keys under server.validation in the shared translation files.

const MAX_TERMS = 10;
const MAX_TERM_LENGTH = 80;

/** A short list of words such as titles or skills (trimmed, empty ones dropped). */
function terms(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_TERMS) return null;
  const out = value.map((v) => (typeof v === 'string' ? v.trim() : null));
  if (out.some((v) => v === null || v.length > MAX_TERM_LENGTH)) return null;
  return (out as string[]).filter(Boolean);
}

/**
 * Body of POST /research/run:
 * `{ sourceKeys: string[], regions?: RegionKey[], filters?: { titles?, skills?, city?, employerTypes? },
 *    customUrls?: string[] }`. customUrls (public career pages, max 5, http(s),
 * no private addresses) go with the "career-pages" source, which needs at least one.
 * An empty `sourceKeys` passes here; the service answers NO_SOURCES_SELECTED with a clear message.
 */
export function parseResearchRequest(body: unknown): ResearchRequest {
  const b = (body ?? {}) as Record<string, unknown>;
  const f = (b.filters ?? {}) as Record<string, unknown>;
  const details: Record<string, string> = {};

  const sourceKeysOk =
    Array.isArray(b.sourceKeys) && b.sourceKeys.every((k) => typeof k === 'string' && k !== '');
  if (!sourceKeysOk) details.sourceKeys = 'sourceKeysInvalid';

  if (b.regions !== undefined) {
    const ok = Array.isArray(b.regions) && b.regions.length > 0 && b.regions.every(isRegionKey);
    if (!ok) details.regions = 'regionInvalid';
  }

  const titles = terms(f.titles);
  const skills = terms(f.skills);
  const cityOk =
    f.city === undefined || (typeof f.city === 'string' && f.city.length <= MAX_TERM_LENGTH);
  const employerTypesOk =
    f.employerTypes === undefined ||
    (Array.isArray(f.employerTypes) && f.employerTypes.every(isEmployerType));
  if (typeof b.filters !== 'undefined' && (typeof b.filters !== 'object' || b.filters === null)) {
    details.filters = 'filtersInvalid';
  } else if (!titles || !skills || !cityOk || !employerTypesOk) {
    details.filters = 'filtersInvalid';
  }

  // Career-page links: checked here for form (http(s), public host); the address
  // they really point to is checked again when fetched.
  let customUrls: string[] = [];
  const wantsPages =
    Array.isArray(b.sourceKeys) && (b.sourceKeys as unknown[]).includes(CAREER_PAGES_KEY);
  if (b.customUrls !== undefined) {
    if (
      !Array.isArray(b.customUrls) ||
      b.customUrls.length > MAX_CUSTOM_URLS ||
      !b.customUrls.every((u) => typeof u === 'string' && u.trim().length > 0 && u.length <= 500)
    ) {
      details.customUrls = 'customUrlsInvalid';
    } else {
      try {
        customUrls = [
          ...new Set((b.customUrls as string[]).map((u) => checkUrlForm(u.trim()).toString())),
        ];
      } catch (err) {
        if (!(err instanceof UnsafeUrlError)) throw err;
        details.customUrls = 'customUrlUnsafe';
      }
    }
  }
  if (!details.customUrls && wantsPages && customUrls.length === 0) {
    details.customUrls = 'customUrlsRequired';
  } else if (!details.customUrls && !wantsPages && customUrls.length > 0) {
    details.customUrls = 'customUrlsWithoutSource';
  }

  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
  const city = typeof f.city === 'string' && f.city.trim() ? f.city.trim() : undefined;
  return {
    sourceKeys: b.sourceKeys as string[],
    regions: b.regions === undefined ? undefined : [...new Set(b.regions as RegionKey[])],
    filters: {
      titles: titles ?? [],
      skills: skills ?? [],
      city,
      employerTypes: [...new Set((f.employerTypes ?? []) as EmployerType[])],
    },
    customUrls,
  };
}
