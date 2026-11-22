import type { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { isItemId } from '../lib/validateProfile.js';
import { keepValidJobs } from '../jobs/sources/normalize.js';
import { getAdapter } from '../jobs/sources/registry.js';
import type { NormalizedJob, ResearchQuery } from '../jobs/sources/types.js';
import { saveJobs } from '../jobs/store.js';
import { Job, notRemoved, toPublicJob } from '../models/Job.js';
import { matchJobs } from './jobMatchService.js';
import { notifyStrongMatches } from './notificationService.js';
import { JobSource } from '../models/JobSource.js';
import type { RegionKey } from '../models/Region.js';
import { ResearchRun, toPublicRun } from '../models/ResearchRun.js';

/** A slow source never holds up one try longer than this. */
export const SOURCE_TIMEOUT_MS = 20_000;
/** Most jobs asked from each source in one run. */
const PER_SOURCE_LIMIT = 50;
/** Doc 9 §5: both regions are selected by default. */
export const DEFAULT_REGIONS: RegionKey[] = ['somaliland', 'somalia'];

/**
 * Retries for a failing source (TIQ-16 End Test: "retried with backoff"):
 * 3 tries in all, waiting 2 s then 4 s. Tests make the wait short.
 */
export const researchSettings = { attempts: 3, retryBaseMs: 2000 };

/** A run still "running" after this long was cut off (e.g. a server restart). */
const STUCK_AFTER_MS = 10 * 60 * 1000;

export interface ResearchRequest {
  sourceKeys: string[];
  regions?: RegionKey[];
  filters: Omit<ResearchQuery, 'regions' | 'limit' | 'customUrls'>;
  /** Career-page links (for the "career-pages" source). */
  customUrls?: string[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
export function rankJobs<T extends Pick<NormalizedJob, 'region'>>(jobs: T[], regions: RegionKey[]) {
  const rank = (job: T) =>
    job.region !== 'remote' && regions.includes(job.region) ? 0 : job.region === 'remote' ? 1 : 2;
  return jobs
    .map((job, index) => ({ job, index, rank: rank(job) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.job);
}

/** One source: up to `attempts` tries with a growing wait; every failure is logged. */
async function searchWithRetry(key: string, query: ResearchQuery) {
  const adapter = getAdapter(key);
  let lastError = 'No adapter';
  for (let attempt = 1; attempt <= researchSettings.attempts; attempt += 1) {
    try {
      if (!adapter) throw new Error('No adapter');
      const raw: unknown[] = await withTimeout(adapter.search(query), SOURCE_TIMEOUT_MS);
      return { raw: Array.isArray(raw) ? raw : [], attempts: attempt, error: undefined };
    } catch (err) {
      lastError = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      console.warn(`[research] source ${key}: try ${attempt} failed: ${lastError}`);
      if (attempt < researchSettings.attempts) {
        await sleep(researchSettings.retryBaseMs * 2 ** (attempt - 1));
      }
    }
  }
  return { raw: [], attempts: researchSettings.attempts, error: lastError };
}

/**
 * POST /research/run (TIQ-16): checks the selection (only enabled sources with
 * an adapter; at least one), starts the run in the background and returns it
 * at once ("running"); the app follows it with GET /research/runs/:id. One
 * run at a time per user.
 */
/**
 * Of these source keys, the ones that can be searched now: switched on, terms
 * checked, adapter in the server, no open reason (also used by schedules,
 * which skip a source an admin switched off).
 */
export async function operationalSourceKeys(keys: string[]) {
  const sources = await JobSource.find({ key: { $in: keys }, enabled: true });
  return new Set(
    sources
      .filter((s) => getAdapter(s.key) && s.termsCheckedAt && !s.unavailableReason)
      .map((s) => s.key),
  );
}

export async function startResearch(
  userId: Types.ObjectId,
  request: ResearchRequest,
  options: { scheduleId?: Types.ObjectId; retryOf?: Types.ObjectId } = {},
) {
  const sourceKeys = [...new Set(request.sourceKeys.map((k) => k.toLowerCase()))];
  if (sourceKeys.length === 0) {
    throw new AppError(400, 'NO_SOURCES_SELECTED', 'Choose at least one job source');
  }
  const usable = await operationalSourceKeys(sourceKeys);
  const unavailable = sourceKeys.filter((k) => !usable.has(k));
  if (unavailable.length > 0) {
    throw new AppError(
      400,
      'SOURCE_NOT_AVAILABLE',
      `These sources are not available: ${unavailable.join(', ')}`,
    );
  }
  if (await ResearchRun.exists({ userId, status: 'running' })) {
    throw new AppError(409, 'RESEARCH_IN_PROGRESS', 'A job search is already running');
  }

  const regions = request.regions?.length ? request.regions : DEFAULT_REGIONS;
  const run = await ResearchRun.create({
    userId,
    status: 'running',
    sourceKeys,
    regions,
    filters: request.filters,
    customUrls: request.customUrls ?? [],
    scheduleId: options.scheduleId ?? null,
    retryOf: options.retryOf ?? null,
    startedAt: new Date(),
  });
  const query: ResearchQuery = {
    ...request.filters,
    regions,
    limit: PER_SOURCE_LIMIT,
    customUrls: request.customUrls ?? [],
  };
  void executeRun(run._id, sourceKeys, query).catch((err: unknown) =>
    console.error('[research] run failed:', err instanceof Error ? err.message : err),
  );
  return toPublicRun(run);
}

/**
 * The background part: searches every selected source (in parallel, each with
 * retries), keeps only valid jobs, stores them once (hash), and writes the run
 * record per source. One failing source never stops the others.
 */
export async function executeRun(
  runId: Types.ObjectId,
  sourceKeys: string[],
  query: ResearchQuery,
) {
  try {
    const results = await Promise.all(
      sourceKeys.map(async (key) => {
        const started = Date.now();
        const searched = await searchWithRetry(key, query);
        const { valid, invalid } = keepValidJobs(key, searched.raw);
        return { key, valid, invalid, ...searched, durationMs: Date.now() - started };
      }),
    );

    // Stored one source after another, so the same job from two sources counts once.
    const perSource = [];
    const allIds: Types.ObjectId[] = [];
    for (const r of results) {
      const saved = await saveJobs(r.valid);
      allIds.push(...saved.ids);
      perSource.push({
        key: r.key,
        queried: true,
        found: r.valid.length + r.invalid,
        invalid: r.invalid,
        new: saved.created,
        duplicates: saved.duplicates,
        attempts: r.attempts,
        error: r.error,
        durationMs: r.durationMs,
      });
    }

    const unique = [...new Map(allIds.map((id) => [String(id), id])).values()];
    const stored = await Job.find({ _id: { $in: unique } }, { region: 1 }).lean();
    const byId = new Map(stored.map((j) => [String(j._id), j]));
    const ranked = rankJobs(
      unique.map((id) => byId.get(String(id))).filter((j) => j !== undefined),
      query.regions,
    ).map((j) => j._id);

    // New strong matches: one in-app item, push and email each (TIQ-22), before the run
    // shows as finished, so the list is up to date with the results. Never fails the search.
    await notifyStrongMatches(runId, ranked).catch((err: unknown) =>
      console.warn('[notify] failed:', err instanceof Error ? err.message : err),
    );

    const failed = results.filter((r) => r.error).length;
    await ResearchRun.updateOne(
      { _id: runId },
      {
        $set: {
          perSource,
          status: failed === 0 ? 'completed' : failed === results.length ? 'failed' : 'partial',
          jobIds: ranked,
          jobsFound: ranked.length,
          jobsNew: perSource.reduce((sum, p) => sum + p.new, 0),
          duplicates: perSource.reduce((sum, p) => sum + p.duplicates, 0),
          finishedAt: new Date(),
        },
      },
    );
    await updateSourceHealth(results.map((r) => ({ key: r.key, ok: !r.error })));
  } catch (err) {
    await ResearchRun.updateOne(
      { _id: runId },
      {
        $set: {
          status: 'failed',
          error: (err instanceof Error ? err.message : String(err)).slice(0, 300),
          finishedAt: new Date(),
        },
      },
    );
    throw err;
  }
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

/** At server start: runs cut off by a restart are marked failed, never left "running". */
export async function recoverStuckRuns(olderThanMs = STUCK_AFTER_MS) {
  const res = await ResearchRun.updateMany(
    { status: 'running', startedAt: { $lt: new Date(Date.now() - olderThanMs) } },
    {
      $set: {
        status: 'failed',
        error: 'The search was interrupted. Please start it again',
        finishedAt: new Date(),
      },
    },
  );
  return res.modifiedCount;
}

/** GET /research/runs: the user's latest runs, newest first. */
export async function listRuns(userId: Types.ObjectId, limit = 20) {
  const runs = await ResearchRun.find({ userId }).sort({ createdAt: -1 }).limit(limit);
  return runs.map(toPublicRun);
}

/**
 * GET /research/runs/:id: one of the user's runs with its jobs (ranked by
 * region) and, once finished, the same jobs scored for the user: the main
 * results and, apart, the lower matches.
 */
const plain = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const wordsOf = (text: string) =>
  plain(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * Does a found job meet the user's filters for this run? Sources may not filter
 * themselves (career pages give all their openings), so the run's results do:
 * job title (every word of one of the titles in the job's title), city (same
 * city), employer type (one of those chosen). No filter = every job.
 */
export function meetsRunFilters(
  job: { title: string; city?: string | null; employerType: string },
  filters: { titles?: string[]; city?: string | null; employerTypes?: string[] },
) {
  const titles = (filters.titles ?? []).map(wordsOf);
  if (titles.length > 0) {
    const words = new Set(wordsOf(job.title));
    if (!titles.some((need) => need.length > 0 && need.every((w) => words.has(w)))) return false;
  }
  if (filters.city && plain(job.city ?? '') !== plain(filters.city)) return false;
  if (filters.employerTypes?.length && !filters.employerTypes.includes(job.employerType)) {
    return false;
  }
  return true;
}

export async function getRun(userId: Types.ObjectId, id: unknown) {
  const run = isItemId(id) ? await ResearchRun.findOne({ _id: id, userId }) : null;
  if (!run) throw new AppError(404, 'RUN_NOT_FOUND', 'Job search not found');
  const jobs = await Job.find({ _id: { $in: run.jobIds }, ...notRemoved });
  const byId = new Map(jobs.map((j) => [String(j._id), j]));
  const ordered = run.jobIds.map((jid) => byId.get(String(jid))).filter((j) => j !== undefined);
  // Results follow the run's filters; the others stay stored (and searchable) but aren't shown here.
  const shown = ordered.filter((j) => meetsRunFilters(j, run.filters ?? {}));
  const matched =
    run.status === 'running'
      ? { recommended: [], lowerMatch: [] }
      : await matchJobs(userId, shown, run.regions);
  return {
    run: toPublicRun(run),
    ...matched,
    /** Jobs found by the run that the filters left out. */
    hiddenByFilters: ordered.length - shown.length,
    jobs: run.jobIds
      .map((jid) => byId.get(String(jid)))
      .filter((j) => j !== undefined)
      .map(toPublicJob),
  };
}

/** Deleting an account deletes its job searches (they hold its search filters). Jobs are shared and stay. */
export async function deleteRuns(userId: Types.ObjectId) {
  await ResearchRun.deleteMany({ userId });
}
