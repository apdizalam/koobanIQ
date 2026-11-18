import type { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { keepValidJobs } from '../jobs/sources/normalize.js';
import { getAdapter } from '../jobs/sources/registry.js';
import type { NormalizedJob, ResearchQuery } from '../jobs/sources/types.js';
import { JobSource } from '../models/JobSource.js';
import type { RegionKey } from '../models/Region.js';
import { ResearchRun, toPublicRun } from '../models/ResearchRun.js';

/** A slow source never holds up the whole run longer than this. */
export const SOURCE_TIMEOUT_MS = 20_000;
/** Most jobs asked from each source in one run. */
const PER_SOURCE_LIMIT = 50;
/** Doc 9 §5: both regions are selected by default. */
export const DEFAULT_REGIONS: RegionKey[] = ['somaliland', 'somalia'];

export interface ResearchRequest {
  sourceKeys: string[];
  regions?: RegionKey[];
  filters: Omit<ResearchQuery, 'regions' | 'limit'>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`No answer within ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Doc 9 §2: jobs in the user's selected regions first, then remote roles, then
 * the rest; order inside each group is kept.
 */
export function rankJobs(jobs: NormalizedJob[], regions: RegionKey[]) {
  const rank = (job: NormalizedJob) =>
    job.region !== 'remote' && regions.includes(job.region) ? 0 : job.region === 'remote' ? 1 : 2;
  return jobs
    .map((job, index) => ({ job, index, rank: rank(job) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.job);
}

/**
 * Runs one research request: searches only the sources the user selected (all
 * must be enabled and have an adapter), records per-source results, and returns
 * the valid jobs ranked by region. One source failing doesn't stop the others.
 * Storing jobs and matching come with the research worker (TIQ-16).
 */
export async function runResearch(userId: Types.ObjectId, request: ResearchRequest) {
  const sourceKeys = [...new Set(request.sourceKeys.map((k) => k.toLowerCase()))];
  if (sourceKeys.length === 0) {
    throw new AppError(400, 'NO_SOURCES_SELECTED', 'Choose at least one job source');
  }
  const sources = await JobSource.find({ key: { $in: sourceKeys }, enabled: true });
  const usable = new Set(sources.filter((s) => getAdapter(s.key)).map((s) => s.key));
  const unavailable = sourceKeys.filter((k) => !usable.has(k));
  if (unavailable.length > 0) {
    throw new AppError(
      400,
      'SOURCE_NOT_AVAILABLE',
      `These sources are not available: ${unavailable.join(', ')}`,
    );
  }

  const regions = request.regions?.length ? request.regions : DEFAULT_REGIONS;
  const query: ResearchQuery = { ...request.filters, regions, limit: PER_SOURCE_LIMIT };
  const run = await ResearchRun.create({
    userId,
    status: 'running',
    sourceKeys,
    regions,
    filters: request.filters,
    startedAt: new Date(),
  });

  const results = await Promise.all(
    sourceKeys.map(async (key) => {
      const started = Date.now();
      const adapter = getAdapter(key);
      try {
        if (!adapter) throw new Error('No adapter');
        const raw: unknown[] = await withTimeout(adapter.search(query), SOURCE_TIMEOUT_MS);
        const { valid, invalid } = keepValidJobs(key, Array.isArray(raw) ? raw : []);
        return {
          key,
          jobs: valid,
          found: valid.length + invalid,
          invalid,
          error: undefined,
          durationMs: Date.now() - started,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          key,
          jobs: [],
          found: 0,
          invalid: 0,
          error: message.slice(0, 300),
          durationMs: Date.now() - started,
        };
      }
    }),
  );

  run.perSource.push(
    ...results.map((r) => ({
      key: r.key,
      queried: true,
      found: r.found,
      invalid: r.invalid,
      error: r.error,
      durationMs: r.durationMs,
    })),
  );
  const failed = results.filter((r) => r.error).length;
  run.status = failed === 0 ? 'completed' : failed === results.length ? 'failed' : 'partial';
  const jobs = rankJobs(
    results.flatMap((r) => r.jobs),
    regions,
  );
  run.jobsFound = jobs.length;
  run.finishedAt = new Date();
  await run.save();

  await updateSourceHealth(results.map((r) => ({ key: r.key, ok: !r.error })));
  return { run: toPublicRun(run), jobs };
}

/**
 * Admin health (doc 9 §8): last success, and an error rate that follows recent
 * runs (each run counts 20%). One atomic update per source, so runs at the same
 * time never overwrite each other.
 */
async function updateSourceHealth(outcomes: { key: string; ok: boolean }[]) {
  await Promise.all(
    outcomes.map(({ key, ok }) =>
      JobSource.updateOne(
        { key },
        [
          {
            $set: {
              errorRate: {
                $round: [
                  { $add: [{ $multiply: [{ $ifNull: ['$errorRate', 0] }, 0.8] }, ok ? 0 : 0.2] },
                  3,
                ],
              },
              ...(ok ? { lastSuccessAt: '$$NOW' } : {}),
            },
          },
        ],
        { updatePipeline: true },
      ),
    ),
  );
}

/** GET /research/runs: the user's latest runs, newest first. */
export async function listRuns(userId: Types.ObjectId, limit = 20) {
  const runs = await ResearchRun.find({ userId }).sort({ createdAt: -1 }).limit(limit);
  return runs.map(toPublicRun);
}
