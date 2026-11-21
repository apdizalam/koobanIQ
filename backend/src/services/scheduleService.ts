import type { Types } from 'mongoose';
import { AppError } from '../lib/errors.js';
import { isItemId } from '../lib/validateProfile.js';
import { nextRunAfter, type ScheduleTiming } from '../lib/zonedTime.js';
import {
  ResearchSchedule,
  toPublicSchedule,
  type ResearchScheduleDocument,
} from '../models/ResearchSchedule.js';
import {
  DEFAULT_REGIONS,
  operationalSourceKeys,
  startResearch,
  type ResearchRequest,
} from './researchService.js';

/** Most schedules one user may keep (protects the free sources from heavy polling). */
export const MAX_SCHEDULES = 5;

/** How often the scheduler looks for due schedules; tests call runDueSchedules directly. */
export const schedulerSettings = { intervalMs: 60_000 };

export type ScheduleInput = ScheduleTiming & ResearchRequest;

const timingOf = (s: ResearchScheduleDocument): ScheduleTiming => ({
  frequency: s.frequency as ScheduleTiming['frequency'],
  time: s.time,
  weekday: s.weekday ?? null,
  timeZone: s.timeZone,
});

async function ownSchedule(userId: Types.ObjectId, id: unknown) {
  const doc = isItemId(id) ? await ResearchSchedule.findOne({ _id: id, userId }) : null;
  if (!doc) throw new AppError(404, 'SCHEDULE_NOT_FOUND', 'Scheduled search not found');
  return doc;
}

/** Only sources that can be searched now may be scheduled (same rule as a search). */
async function checkSources(sourceKeys: string[]) {
  const keys = [...new Set(sourceKeys.map((k) => k.toLowerCase()))];
  if (keys.length === 0) {
    throw new AppError(400, 'NO_SOURCES_SELECTED', 'Choose at least one job source');
  }
  const usable = await operationalSourceKeys(keys);
  const unavailable = keys.filter((k) => !usable.has(k));
  if (unavailable.length > 0) {
    throw new AppError(
      400,
      'SOURCE_NOT_AVAILABLE',
      `These sources are not available: ${unavailable.join(', ')}`,
    );
  }
  return keys;
}

/** POST /research/schedules (TIQ-21). The first run is the next local time after now. */
export async function createSchedule(
  userId: Types.ObjectId,
  input: ScheduleInput,
  now = new Date(),
) {
  if ((await ResearchSchedule.countDocuments({ userId })) >= MAX_SCHEDULES) {
    throw new AppError(
      409,
      'SCHEDULE_LIMIT',
      `You can keep up to ${MAX_SCHEDULES} scheduled searches`,
    );
  }
  const sourceKeys = await checkSources(input.sourceKeys);
  const doc = await ResearchSchedule.create({
    userId,
    frequency: input.frequency,
    time: input.time,
    weekday: input.frequency === 'weekly' ? (input.weekday ?? 0) : null,
    timeZone: input.timeZone,
    sourceKeys,
    regions: input.regions?.length ? input.regions : DEFAULT_REGIONS,
    filters: input.filters,
    customUrls: input.customUrls ?? [],
    nextRunAt: nextRunAfter(input, now),
  });
  return toPublicSchedule(doc);
}

export async function listSchedules(userId: Types.ObjectId) {
  const docs = await ResearchSchedule.find({ userId }).sort({ createdAt: -1 });
  return docs.map(toPublicSchedule);
}

/**
 * PATCH /research/schedules/:id { enabled?, frequency?, time?, weekday?, timeZone? }.
 * Switching off clears the next run at once (no more runs); switching on or a
 * new time sets the next run from now.
 */
export async function updateSchedule(
  userId: Types.ObjectId,
  id: unknown,
  changes: Partial<ScheduleTiming> & { enabled?: boolean },
  now = new Date(),
) {
  const doc = await ownSchedule(userId, id);
  if (changes.frequency !== undefined) doc.frequency = changes.frequency;
  if (changes.time !== undefined) doc.time = changes.time;
  if (changes.timeZone !== undefined) doc.timeZone = changes.timeZone;
  if (changes.weekday !== undefined || changes.frequency !== undefined) {
    doc.weekday = doc.frequency === 'weekly' ? (changes.weekday ?? doc.weekday ?? 0) : null;
  }
  if (changes.enabled !== undefined) doc.enabled = changes.enabled;
  doc.nextRunAt = doc.enabled ? nextRunAfter(timingOf(doc), now) : null;
  await doc.save();
  return toPublicSchedule(doc);
}

export async function deleteSchedule(userId: Types.ObjectId, id: unknown) {
  const doc = await ownSchedule(userId, id);
  await doc.deleteOne();
}

/** Deleting an account deletes its schedules. */
export async function deleteSchedules(userId: Types.ObjectId) {
  await ResearchSchedule.deleteMany({ userId });
}

/**
 * Starts every schedule whose time has come. Each one is claimed atomically
 * (its nextRunAt moves to the next local time first), so two servers or two
 * ticks never start it twice; times missed while the server was off run once,
 * not once per missed time. Sources an admin switched off are skipped; when
 * none is left, or a search of the user is still running, this time is skipped
 * with the reason. Returns how many runs were started.
 */
export async function runDueSchedules(now = new Date()) {
  let started = 0;
  const due = await ResearchSchedule.find({ enabled: true, nextRunAt: { $lte: now } }).limit(50);
  for (const doc of due) {
    const claimed = await ResearchSchedule.findOneAndUpdate(
      { _id: doc._id, enabled: true, nextRunAt: doc.nextRunAt },
      { $set: { nextRunAt: nextRunAfter(timingOf(doc), now) } },
      { new: true },
    );
    if (!claimed) continue; // switched off, or another tick took it

    const usable = await operationalSourceKeys(claimed.sourceKeys);
    const sourceKeys = claimed.sourceKeys.filter((k) => usable.has(k));
    if (sourceKeys.length === 0) {
      await ResearchSchedule.updateOne({ _id: claimed._id }, { $set: { lastSkip: 'no_sources' } });
      continue;
    }
    try {
      const run = await startResearch(
        claimed.userId,
        {
          sourceKeys,
          regions: claimed.regions as ResearchRequest['regions'],
          filters: {
            titles: claimed.filters?.titles ?? [],
            skills: claimed.filters?.skills ?? [],
            city: claimed.filters?.city ?? undefined,
            employerTypes: (claimed.filters?.employerTypes ??
              []) as ResearchRequest['filters']['employerTypes'],
          },
          // Links only matter for the career-pages source; kept only while it is searched.
          customUrls: sourceKeys.includes('career-pages') ? claimed.customUrls : [],
        },
        { scheduleId: claimed._id },
      );
      await ResearchSchedule.updateOne(
        { _id: claimed._id },
        {
          $set: { lastRunAt: now, lastRunId: run.id, lastSkip: null },
          $inc: { runCount: 1 },
        },
      );
      started += 1;
    } catch (err) {
      const busy = err instanceof AppError && err.code === 'RESEARCH_IN_PROGRESS';
      if (!busy) console.warn('[schedule] run not started:', (err as Error).message);
      await ResearchSchedule.updateOne(
        { _id: claimed._id },
        { $set: { lastSkip: busy ? 'busy' : 'error' } },
      );
    }
  }
  return started;
}

let timer: NodeJS.Timeout | null = null;

/** Starts the in-process scheduler (server start only; no extra service needed). */
export function startScheduler() {
  if (timer) return;
  const tick = () =>
    void runDueSchedules().catch((err: unknown) =>
      console.error('[schedule] tick failed:', err instanceof Error ? err.message : err),
    );
  timer = setInterval(tick, schedulerSettings.intervalMs);
  timer.unref();
  tick();
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
