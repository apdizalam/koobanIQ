import type { Request } from 'express';
import { AppError } from '../lib/errors.js';
import {
  JobSource,
  toAdminJobSource,
  toPublicJobSource,
  type EmployerType,
} from '../models/JobSource.js';
import { DEFAULT_REGIONS, Region, toPublicRegion, type RegionKey } from '../models/Region.js';
import { recordAudit } from './auditService.js';

/**
 * Creates the three regions with doc 9's starting city lists if they don't
 * exist yet. Never overwrites cities an admin has edited. Safe to run at every start.
 */
export async function ensureDefaultRegions() {
  await Region.bulkWrite(
    DEFAULT_REGIONS.map((region) => ({
      updateOne: {
        filter: { key: region.key },
        update: { $setOnInsert: region },
        upsert: true,
      },
    })),
  );
}

/** GET /regions: every region in display order, with its city suggestions. */
export async function listRegions() {
  const regions = await Region.find().sort({ order: 1 });
  return regions.map(toPublicRegion);
}

/**
 * GET /job-sources: enabled sources only, optionally just those covering at
 * least one of `regions`, in display order (priority, then name).
 */
export async function listEnabledSources(regions?: RegionKey[]) {
  const filter = regions?.length ? { enabled: true, regions: { $in: regions } } : { enabled: true };
  const sources = await JobSource.find(filter).sort({ priority: 1, name: 1 });
  return sources.map(toPublicJobSource);
}

/** GET /admin/job-sources: every source, enabled or not, with health and terms check. */
export async function listAllSources() {
  const sources = await JobSource.find().sort({ priority: 1, name: 1 });
  return sources.map(toAdminJobSource);
}

export interface SourceChanges {
  enabled?: boolean;
  regions?: RegionKey[];
  employerTypes?: EmployerType[];
  priority?: number;
}

/**
 * PATCH /admin/job-sources/:key. A source can only be switched on after its
 * terms were checked (doc 9 §3). Every change is written to the audit log.
 */
export async function updateSource(req: Request, key: string, changes: SourceChanges) {
  const source = await JobSource.findOne({ key: key.toLowerCase() });
  if (!source) {
    throw new AppError(404, 'JOB_SOURCE_NOT_FOUND', 'Job source not found');
  }
  if (changes.enabled === true && !source.termsCheckedAt) {
    throw new AppError(
      409,
      'SOURCE_TERMS_NOT_CHECKED',
      "This source can't be enabled until its terms have been checked",
    );
  }

  const before = toAdminJobSource(source);
  if (changes.enabled !== undefined) source.enabled = changes.enabled;
  if (changes.regions !== undefined) source.regions = changes.regions;
  if (changes.employerTypes !== undefined) source.employerTypes = changes.employerTypes;
  if (changes.priority !== undefined) source.priority = changes.priority;
  await source.save();
  const after = toAdminJobSource(source);

  const action =
    changes.enabled !== undefined && changes.enabled !== before.enabled
      ? changes.enabled
        ? 'job_source.enable'
        : 'job_source.disable'
      : 'job_source.update';
  await recordAudit(req, { action, targetType: 'jobSource', targetId: source.key, before, after });
  return after;
}

/** PATCH /admin/regions/:key: replace a region's city suggestions (audited). */
export async function updateRegionCities(req: Request, key: RegionKey, cities: string[]) {
  const region = await Region.findOne({ key });
  if (!region) {
    throw new AppError(404, 'REGION_NOT_FOUND', 'Region not found');
  }
  const before = toPublicRegion(region);
  region.cities = cities;
  await region.save();
  const after = toPublicRegion(region);
  await recordAudit(req, {
    action: 'region.update',
    targetType: 'region',
    targetId: key,
    before,
    after,
  });
  return after;
}
