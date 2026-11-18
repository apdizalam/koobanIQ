/**
 * @kobaniq/shared — values that every KOBANIQ app must agree on.
 * Source of truth: Notion doc 7 · Architecture (database schema).
 */

/** Supported UI and content languages. */
export const LANGUAGES = ['en', 'so'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

/** Account roles (users.role). */
export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Account status (users.status). */
export const USER_STATUSES = ['active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Job regions (doc 9 §2). Somaliland and Somalia are separate, selectable regions. */
export const REGION_KEYS = ['somaliland', 'somalia', 'remote'] as const;
export type RegionKey = (typeof REGION_KEYS)[number];

/** Employer types a job source covers (doc 9 §4). */
export const EMPLOYER_TYPES = [
  'company',
  'ngo',
  'un_agency',
  'government',
  'education',
  'health',
  'other',
] as const;
export type EmployerType = (typeof EMPLOYER_TYPES)[number];

/** Standard API response envelope: { data, error, meta }. */
export interface ApiError {
  code: string;
  message: string;
}
export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  meta: Record<string, unknown>;
}

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
