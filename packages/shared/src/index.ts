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
