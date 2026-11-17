import type { PublicUser, Session } from '../types/auth';
import { apiRequest } from './api';

export const login = (email: string, password: string) =>
  apiRequest<Session>('/auth/login', { method: 'POST', body: { email, password } });

export const logout = (refreshToken: string) =>
  apiRequest<void>('/auth/logout', { method: 'POST', body: { refreshToken } });

/** 200 only for admins; 403 FORBIDDEN for everyone else. */
export const checkAdminAccess = (accessToken: string) =>
  apiRequest<{ access: true; user: PublicUser }>('/admin/access', { accessToken });
