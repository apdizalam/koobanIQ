import type { Request, Response } from 'express';
import {
  parseRegionCities,
  parseRegionKey,
  parseRegionsQuery,
  parseSourceChanges,
} from '../lib/validateSources.js';
import {
  listAllSources,
  listEnabledSources,
  listRegions,
  updateRegionCities,
  updateSource,
} from '../services/jobSourceService.js';

/** GET /api/v1/regions: Somaliland, Somalia, Remote with city suggestions. */
export async function getRegions(_req: Request, res: Response) {
  res.json({ data: { regions: await listRegions() }, error: null, meta: {} });
}

/** GET /api/v1/job-sources?regions=somaliland,somalia: enabled sources for the app. */
export async function getJobSources(req: Request, res: Response) {
  const regions = parseRegionsQuery(req.query.regions);
  // sources: can be searched; unavailable: listed with the reason, not selectable.
  res.json({ data: await listEnabledSources(regions), error: null, meta: {} });
}

/** GET /api/v1/admin/job-sources: every source with health and terms check. */
export async function getAdminJobSources(_req: Request, res: Response) {
  res.json({ data: { sources: await listAllSources() }, error: null, meta: {} });
}

/** PATCH /api/v1/admin/job-sources/:key { enabled?, regions?, employerTypes?, priority? } */
export async function patchJobSource(req: Request, res: Response) {
  const source = await updateSource(req, String(req.params.key), parseSourceChanges(req.body));
  res.json({ data: { source }, error: null, meta: {} });
}

/** PATCH /api/v1/admin/regions/:key { cities: string[] } */
export async function patchRegion(req: Request, res: Response) {
  const key = parseRegionKey(req.params.key);
  const region = await updateRegionCities(req, key, parseRegionCities(req.body));
  res.json({ data: { region }, error: null, meta: {} });
}
