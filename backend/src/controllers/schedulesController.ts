import type { Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { parseResearchRequest } from '../lib/validateResearch.js';
import {
  isTimeZone,
  parseTime,
  SCHEDULE_FREQUENCIES,
  type ScheduleFrequency,
  type ScheduleTiming,
} from '../lib/zonedTime.js';
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateSchedule,
} from '../services/scheduleService.js';

type Body = Record<string, unknown>;
const bodyOf = (body: unknown): Body => (body && typeof body === 'object' ? (body as Body) : {});

const TIMING_KEYS = ['frequency', 'time', 'weekday', 'timeZone'];
const RESEARCH_KEYS = ['sourceKeys', 'regions', 'filters', 'customUrls'];

/** Checks the timing fields that are present (all required when `required`). */
function checkTiming(b: Body, details: Record<string, string>, required: boolean) {
  if (required || b.frequency !== undefined) {
    if (!(SCHEDULE_FREQUENCIES as readonly unknown[]).includes(b.frequency)) {
      details.frequency = 'frequencyInvalid';
    }
  }
  if ((required || b.time !== undefined) && !parseTime(b.time)) details.time = 'timeInvalid';
  if (b.weekday !== undefined && b.weekday !== null) {
    if (
      typeof b.weekday !== 'number' ||
      !Number.isInteger(b.weekday) ||
      b.weekday < 0 ||
      b.weekday > 6
    ) {
      details.weekday = 'weekdayInvalid';
    }
  }
  if ((required || b.timeZone !== undefined) && !isTimeZone(b.timeZone)) {
    details.timeZone = 'timeZoneInvalid';
  }
}

function fail(details: Record<string, string>) {
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
}

/** POST /api/v1/research/schedules { frequency, time, weekday?, timeZone, sourceKeys, regions?, filters?, customUrls? } */
export async function postSchedule(req: Request, res: Response) {
  const b = bodyOf(req.body);
  const details: Record<string, string> = {};
  for (const key of Object.keys(b)) {
    if (![...TIMING_KEYS, ...RESEARCH_KEYS].includes(key)) details[key] = 'fieldNotEditable';
  }
  checkTiming(b, details, true);
  fail(details);
  // The search part follows exactly the rules of a search started by hand.
  const research = parseResearchRequest(
    Object.fromEntries(RESEARCH_KEYS.filter((k) => k in b).map((k) => [k, b[k]])),
  );
  const timing: ScheduleTiming = {
    frequency: b.frequency as ScheduleFrequency,
    time: b.time as string,
    weekday: (b.weekday as number | undefined) ?? null,
    timeZone: b.timeZone as string,
  };
  const schedule = await createSchedule(req.user!._id, { ...research, ...timing });
  res.status(201).json({ data: { schedule }, error: null, meta: {} });
}

/** GET /api/v1/research/schedules */
export async function getSchedules(req: Request, res: Response) {
  res.json({ data: { schedules: await listSchedules(req.user!._id) }, error: null, meta: {} });
}

/** PATCH /api/v1/research/schedules/:id { enabled?, frequency?, time?, weekday?, timeZone? } */
export async function patchSchedule(req: Request, res: Response) {
  const b = bodyOf(req.body);
  const details: Record<string, string> = {};
  for (const key of Object.keys(b)) {
    if (![...TIMING_KEYS, 'enabled'].includes(key)) details[key] = 'fieldNotEditable';
  }
  if (b.enabled !== undefined && typeof b.enabled !== 'boolean') details.enabled = 'enabledInvalid';
  checkTiming(b, details, false);
  fail(details);
  const schedule = await updateSchedule(req.user!._id, req.params.id, {
    enabled: b.enabled as boolean | undefined,
    frequency: b.frequency as ScheduleFrequency | undefined,
    time: b.time as string | undefined,
    weekday: b.weekday as number | null | undefined,
    timeZone: b.timeZone as string | undefined,
  });
  res.json({ data: { schedule }, error: null, meta: {} });
}

/** DELETE /api/v1/research/schedules/:id */
export async function removeSchedule(req: Request, res: Response) {
  await deleteSchedule(req.user!._id, req.params.id);
  res.status(204).end();
}
