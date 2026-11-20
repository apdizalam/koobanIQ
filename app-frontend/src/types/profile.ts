/** The user's profile as GET /api/v1/profile returns it (backend models/Profile.ts). */

export const REGION_KEYS = ['somaliland', 'somalia', 'remote'] as const;
export type RegionKey = (typeof REGION_KEYS)[number];
export const EMPLOYER_TYPES = [
  'company',
  'ngo',
  'un_agency',
  'government',
  'education',
  'health',
  'other',
] as const;
export const LANGUAGE_LEVELS = ['basic', 'conversational', 'fluent', 'native'] as const;
export const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const;
export const JOB_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'volunteer'] as const;

/** List sections: each item has its own id. */
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

/** One entry of a list section; fields depend on the section. */
export type ProfileItem = { id: string } & Record<string, string | number | string[] | undefined>;

export interface Preferences {
  titles: string[];
  regions: string[];
  cities: string[];
  employerTypes: string[];
  workModes: string[];
  jobTypes: string[];
}

export interface Profile {
  personal: Record<string, string | undefined>;
  experience: ProfileItem[];
  education: ProfileItem[];
  projects: ProfileItem[];
  certifications: ProfileItem[];
  languages: ProfileItem[];
  preferences: Preferences;
  /** 0–100: personal basics, experience, education, languages, preferences. */
  completion: number;
  updatedAt?: string;
}
