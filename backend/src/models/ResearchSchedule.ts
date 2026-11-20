import { Schema, Types, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { SCHEDULE_FREQUENCIES } from '../lib/zonedTime.js';
import { EMPLOYER_TYPES } from './JobSource.js';
import { REGION_KEYS } from './Region.js';

/** Why a scheduled run did not start this time (shown to the user). */
export const SCHEDULE_SKIPS = ['no_sources', 'busy', 'error'] as const;

/**
 * `researchSchedules` collection (TIQ-21): a saved job search that runs by
 * itself (hourly, every 6 hours, daily, weekly) at a local time in the user's
 * time zone. Each schedule keeps its own regions, sources, filters and links.
 * The scheduler (services/scheduleService.ts) starts it when `nextRunAt` has
 * come; every run it starts is an ordinary research run with `scheduleId`.
 */
const researchScheduleSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    frequency: { type: String, enum: SCHEDULE_FREQUENCIES, required: true },
    /** Local "HH:MM". */
    time: { type: String, required: true },
    /** weekly: 0 = Monday … 6 = Sunday. */
    weekday: { type: Number, min: 0, max: 6, default: null },
    timeZone: { type: String, required: true },
    sourceKeys: { type: [String], required: true },
    regions: { type: [{ type: String, enum: REGION_KEYS }], required: true },
    filters: {
      titles: { type: [String], default: [] },
      skills: { type: [String], default: [] },
      city: { type: String },
      employerTypes: { type: [{ type: String, enum: EMPLOYER_TYPES }], default: [] },
    },
    customUrls: { type: [String], default: [] },
    enabled: { type: Boolean, default: true },
    /** When it runs next (null while switched off). */
    nextRunAt: { type: Date, default: null, index: true },
    lastRunAt: { type: Date, default: null },
    lastRunId: { type: Types.ObjectId, ref: 'ResearchRun', default: null },
    /** Set when the last due time did not start a run, with the reason. */
    lastSkip: { type: String, enum: [...SCHEDULE_SKIPS, null], default: null },
    runCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

researchScheduleSchema.index({ enabled: 1, nextRunAt: 1 });

export type ResearchScheduleDocument = HydratedDocument<
  InferSchemaType<typeof researchScheduleSchema>
>;
export const ResearchSchedule = model('ResearchSchedule', researchScheduleSchema);

export function toPublicSchedule(s: ResearchScheduleDocument) {
  return {
    id: String(s._id),
    frequency: s.frequency,
    time: s.time,
    weekday: s.weekday ?? null,
    timeZone: s.timeZone,
    sourceKeys: s.sourceKeys,
    regions: s.regions,
    filters: s.filters,
    customUrls: s.customUrls,
    enabled: s.enabled,
    nextRunAt: s.nextRunAt ?? null,
    lastRunAt: s.lastRunAt ?? null,
    lastRunId: s.lastRunId ? String(s.lastRunId) : null,
    lastSkip: s.lastSkip ?? null,
    runCount: s.runCount,
    createdAt: s.createdAt,
  };
}
