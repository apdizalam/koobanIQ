import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

// Same values as @kobaniq/shared (ROLES, USER_STATUSES, LANGUAGES).
export const ROLES = ['user', 'admin'] as const;
export const USER_STATUSES = ['active', 'suspended'] as const;
export const LANGUAGES = ['en', 'so'] as const;
export const AUTH_PROVIDERS = ['local', 'google'] as const;

export type Role = (typeof ROLES)[number];
export type UserStatus = (typeof USER_STATUSES)[number];
export type Language = (typeof LANGUAGES)[number];

/** `users` collection — see Notion "7 · Architecture" → Database schema. */
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /** Never returned by default queries. */
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ROLES, default: 'user', index: true },
    status: { type: String, enum: USER_STATUSES, default: 'active', index: true },
    emailVerified: { type: Boolean, default: false },
    authProvider: { type: String, enum: AUTH_PROVIDERS, default: 'local' },
    preferredLanguage: { type: String, enum: LANGUAGES, default: 'en' },
    lastActiveAt: { type: Date },
    /**
     * When the user confirmed "I am 18 or older" at sign-up (owner requirement;
     * the free AI tier's terms also require adult users). Required for new accounts.
     */
    ageConfirmedAt: { type: Date },
    /**
     * Test account with fictional data: may use AI features that send profile
     * data while the AI personal-data setting is BLOCKED. Set only by an admin in the
     * Admin Dashboard (with a reason, audited); never from the email address.
     */
    testAccount: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type UserFields = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<UserFields>;

export const User = model('User', userSchema);

/** The safe shape sent to clients (no password hash, no internals). */
export function toPublicUser(user: UserDocument) {
  return {
    id: user.id as string,
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerified,
    preferredLanguage: user.preferredLanguage,
    createdAt: user.createdAt,
  };
}
