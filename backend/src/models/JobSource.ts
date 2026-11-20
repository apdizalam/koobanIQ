import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { LANGUAGES } from './User.js';
import { REGION_KEYS } from './Region.js';
import { UNAVAILABLE_REASONS } from '../jobs/sources/catalog.js';

// Values from doc 9 §4 (job source catalog).
export const SOURCE_TYPES = ['job_board', 'ngo_un', 'employer', 'government', 'partner'] as const;
export const EMPLOYER_TYPES = [
  'company',
  'ngo',
  'un_agency',
  'government',
  'education',
  'health',
  'other',
] as const;
export const SOURCE_CONNECTIONS = ['api', 'feed', 'manual_import'] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];
export type EmployerType = (typeof EMPLOYER_TYPES)[number];

export const isEmployerType = (value: unknown): value is EmployerType =>
  typeof value === 'string' && (EMPLOYER_TYPES as readonly string[]).includes(value);

/**
 * `jobSources` collection (doc 9 §4). A source starts disabled and can only be
 * switched on after its terms were checked and permit our use (doc 9 §3:
 * no scraping where it isn't allowed).
 */
const jobSourceSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    type: { type: String, enum: SOURCE_TYPES, required: true },
    regions: { type: [{ type: String, enum: REGION_KEYS }], default: [] },
    employerTypes: { type: [{ type: String, enum: EMPLOYER_TYPES }], default: [] },
    /** Languages the listings are usually written in. */
    languages: { type: [{ type: String, enum: LANGUAGES }], default: ['en'] },
    connection: { type: String, enum: SOURCE_CONNECTIONS, required: true },
    enabled: { type: Boolean, default: false, index: true },
    /** Display order in the app (lower first). */
    priority: { type: Number, default: 100 },
    logoUrl: { type: String },
    website: { type: String },
    termsUrl: { type: String },
    /** When the team confirmed the source's terms permit our use. Required before enabling. */
    termsCheckedAt: { type: Date },
    /** Requests allowed per minute by the source. */
    rateLimitPerMinute: { type: Number },
    /** Shown to users even when it can't be searched (with `unavailableReason`). */
    listed: { type: Boolean, default: false },
    /** Why it can't be searched (no free API, needs approval / permission, terms unverified). */
    unavailableReason: { type: String, enum: UNAVAILABLE_REASONS },
    /** Name credited on its jobs ("via …"), when its terms ask for it. */
    attribution: { type: String },
    /** Searches the career-page links the user gives. */
    acceptsUrls: { type: Boolean, default: false },
    // Health, shown in admin (updated by research runs, TIQ-16).
    lastSuccessAt: { type: Date },
    errorRate: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export type JobSourceDocument = HydratedDocument<InferSchemaType<typeof jobSourceSchema>>;
export const JobSource = model('JobSource', jobSourceSchema);

/** What the mobile app sees: enough to show and choose a source. */
export function toPublicJobSource(source: JobSourceDocument) {
  return {
    key: source.key,
    name: source.name,
    type: source.type,
    regions: source.regions,
    employerTypes: source.employerTypes,
    languages: source.languages,
    logoUrl: source.logoUrl ?? null,
    website: source.website ?? null,
    attribution: source.attribution ?? null,
    acceptsUrls: source.acceptsUrls === true,
    status: 'operational' as const,
  };
}

/** A listed source that can't be searched: shown, not selectable, with the reason. */
export function toUnavailableJobSource(source: JobSourceDocument) {
  return {
    key: source.key,
    name: source.name,
    type: source.type,
    regions: source.regions,
    website: source.website ?? null,
    status: 'unavailable' as const,
    reason: source.unavailableReason ?? 'not_enabled',
  };
}

/** What admins see: everything, including health and the terms check. */
export function toAdminJobSource(source: JobSourceDocument) {
  return {
    ...toPublicJobSource(source),
    connection: source.connection,
    enabled: source.enabled,
    priority: source.priority,
    termsUrl: source.termsUrl ?? null,
    termsCheckedAt: source.termsCheckedAt ?? null,
    rateLimitPerMinute: source.rateLimitPerMinute ?? null,
    lastSuccessAt: source.lastSuccessAt ?? null,
    errorRate: source.errorRate,
    updatedAt: source.updatedAt,
  };
}
