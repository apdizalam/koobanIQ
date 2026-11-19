import { Schema, model, type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';
import { EMPLOYER_TYPES } from './JobSource.js';
import { REGION_KEYS } from './Region.js';

// Values for the profile (TIQ-6, PRD FR-PROF-01).
export const LANGUAGE_LEVELS = ['basic', 'conversational', 'fluent', 'native'] as const;
export const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const;
export const JOB_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'volunteer'] as const;

/** The list sections; each item gets its own id. */
export const PROFILE_SECTIONS = [
  'experience',
  'education',
  'projects',
  'certifications',
  'languages',
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export const isProfileSection = (value: unknown): value is ProfileSection =>
  typeof value === 'string' && (PROFILE_SECTIONS as readonly string[]).includes(value);

const experienceSchema = new Schema({
  title: { type: String, required: true },
  employer: { type: String, required: true },
  city: String,
  region: { type: String, enum: REGION_KEYS },
  /** "YYYY-MM". */
  startDate: { type: String, required: true },
  /** "YYYY-MM"; empty = current job. */
  endDate: String,
  description: String,
});

const educationSchema = new Schema({
  school: { type: String, required: true },
  degree: String,
  field: String,
  startYear: Number,
  endYear: Number,
});

const projectSchema = new Schema({
  name: { type: String, required: true },
  description: String,
  url: String,
  skills: { type: [String], default: undefined },
});

const certificationSchema = new Schema({
  name: { type: String, required: true },
  issuer: String,
  /** "YYYY-MM". */
  issuedOn: String,
  url: String,
});

const languageSchema = new Schema({
  language: { type: String, required: true },
  level: { type: String, enum: LANGUAGE_LEVELS, required: true },
});

/**
 * `profiles` collection: one per user, only ever read or changed through the
 * signed-in user's own id (never an id from the request). Skills have their
 * own module (TIQ-12).
 */
const profileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    personal: {
      fullName: String,
      /** The job title the user wants ("preferred title"). */
      headline: String,
      profession: String,
      region: { type: String, enum: REGION_KEYS },
      city: String,
      phone: String,
      /** Email shown on CVs. Separate from the login email; changing it never changes the account. */
      contactEmail: String,
      summary: String,
    },
    experience: { type: [experienceSchema], default: [] },
    education: { type: [educationSchema], default: [] },
    projects: { type: [projectSchema], default: [] },
    certifications: { type: [certificationSchema], default: [] },
    languages: { type: [languageSchema], default: [] },
    preferences: {
      titles: { type: [String], default: [] },
      regions: { type: [{ type: String, enum: REGION_KEYS }], default: [] },
      cities: { type: [String], default: [] },
      employerTypes: { type: [{ type: String, enum: EMPLOYER_TYPES }], default: [] },
      workModes: { type: [{ type: String, enum: WORK_MODES }], default: [] },
      jobTypes: { type: [{ type: String, enum: JOB_TYPES }], default: [] },
    },
  },
  { timestamps: true },
);

export type ProfileDocument = HydratedDocument<InferSchemaType<typeof profileSchema>>;
export const Profile = model('Profile', profileSchema);

type Plain = Record<string, unknown> & { _id?: Types.ObjectId };

/** Subdocument → plain object with `id` instead of `_id`, no empty fields. */
function item(doc: { toObject(): Plain }) {
  const { _id, ...rest } = doc.toObject();
  const clean = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
  return { id: String(_id), ...clean };
}

/** Plain object without Mongoose bookkeeping or empty fields. */
function plain(value: unknown): Record<string, unknown> {
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([key, v]) => key !== '_id' && v !== undefined && v !== null && v !== '',
    ),
  );
}

/**
 * How complete the profile is (0–100), for Home: personal basics, experience,
 * education, languages and job preferences, each one fifth.
 */
export function profileCompletion(profile: ProfileDocument): number {
  const p = profile.personal ?? {};
  const prefs = profile.preferences;
  const parts = [
    Boolean(p.fullName && p.headline && (p.city || p.region)),
    profile.experience.length > 0,
    profile.education.length > 0,
    profile.languages.length > 0,
    Boolean(prefs && (prefs.titles.length > 0 || prefs.regions.length > 0)),
  ];
  return Math.round((parts.filter(Boolean).length / parts.length) * 100);
}

export function toPublicProfile(profile: ProfileDocument) {
  const prefs = profile.preferences;
  return {
    personal: plain(profile.toObject().personal),
    experience: profile.experience.map(item),
    education: profile.education.map(item),
    projects: profile.projects.map(item),
    certifications: profile.certifications.map(item),
    languages: profile.languages.map(item),
    preferences: {
      titles: prefs?.titles ?? [],
      regions: prefs?.regions ?? [],
      cities: prefs?.cities ?? [],
      employerTypes: prefs?.employerTypes ?? [],
      workModes: prefs?.workModes ?? [],
      jobTypes: prefs?.jobTypes ?? [],
    },
    completion: profileCompletion(profile),
    updatedAt: profile.updatedAt,
  };
}
