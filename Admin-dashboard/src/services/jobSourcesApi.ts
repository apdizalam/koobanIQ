import type { AuthState } from '../auth/authContext';
import type { AdminJobSource, Region, RegionKey, SourceChanges } from '../types/jobSources';

type Request = AuthState['request'];

/** Same limits as the backend (lib/validateSources.ts). */
export const MAX_CITIES = 100;
export const MAX_CITY_LENGTH = 60;
export const MAX_PRIORITY = 1000;

export const fetchJobSources = (request: Request) =>
  request<{ sources: AdminJobSource[] }>('/admin/job-sources');

export const updateJobSource = async (request: Request, key: string, changes: SourceChanges) =>
  (
    await request<{ source: Omit<AdminJobSource, 'hasAdapter'> }>(
      `/admin/job-sources/${encodeURIComponent(key)}`,
      { method: 'PATCH', body: changes },
    )
  ).source;

export const fetchRegions = (request: Request) => request<{ regions: Region[] }>('/regions');

export const updateRegionCities = async (request: Request, key: RegionKey, cities: string[]) =>
  (
    await request<{ region: Region }>(`/admin/regions/${encodeURIComponent(key)}`, {
      method: 'PATCH',
      body: { cities },
    })
  ).region;

/**
 * Why a source can't be switched on, or null when it can. The server checks the
 * same rules (409 SOURCE_TERMS_NOT_CHECKED / SOURCE_ADAPTER_MISSING).
 */
export function enableBlocker(source: AdminJobSource): 'terms' | 'adapter' | null {
  if (source.enabled) return null;
  if (!source.termsCheckedAt) return 'terms';
  if (!source.hasAdapter) return 'adapter';
  return null;
}

/** Only the fields that really changed, so the audit log stays exact. */
export function sourceChanges(
  source: AdminJobSource,
  edit: Required<Omit<SourceChanges, 'enabled'>>,
): Omit<SourceChanges, 'enabled'> {
  const sameList = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const out: Omit<SourceChanges, 'enabled'> = {};
  if (!sameList(source.regions, edit.regions)) out.regions = edit.regions;
  if (!sameList(source.employerTypes, edit.employerTypes)) out.employerTypes = edit.employerTypes;
  if (source.priority !== edit.priority) out.priority = edit.priority;
  return out;
}

/** A priority typed by the admin: a whole number 0–1000, else null. */
export function parsePriority(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value <= MAX_PRIORITY ? value : null;
}

/**
 * The city text box (one city per line) → the list to save: trimmed, empty lines
 * and repeats (any letter case) left out. `problem` says what the server would refuse.
 */
export function parseCityLines(text: string): {
  cities: string[];
  problem: 'tooMany' | 'tooLong' | null;
} {
  const seen = new Set<string>();
  const cities: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const city = line.trim();
    if (!city || seen.has(city.toLowerCase())) continue;
    seen.add(city.toLowerCase());
    cities.push(city);
  }
  const problem = cities.some((c) => c.length > MAX_CITY_LENGTH)
    ? 'tooLong'
    : cities.length > MAX_CITIES
      ? 'tooMany'
      : null;
  return { cities, problem };
}

/** Error rate 0–1 → whole percent for the health column. */
export const errorPercent = (rate: number) => Math.round(Math.min(Math.max(rate, 0), 1) * 100);
