import type { PublicUser } from './auth';

/** A user as the admin pages see it (backend services/adminUserService.ts). */
export interface AdminUser extends PublicUser {
  lastActiveAt: string | null;
  /** Test account with fictional data (set by an admin with a reason). */
  testAccount: boolean;
}

export interface AdminUserDetail extends AdminUser {
  /** Devices signed in right now. */
  activeSessions: number;
}

export interface UserPage {
  items: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface UserFilters {
  q: string;
  role: '' | PublicUser['role'];
  status: '' | PublicUser['status'];
  page: number;
}

/** The four changes an admin can make on a user's page. */
export type UserAction = 'suspend' | 'reactivate' | 'makeAdmin' | 'makeUser' | 'delete';
