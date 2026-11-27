import type { AuthState } from '../auth/authContext';

type Request = AuthState['request'];

/** Backend services/adminWaitlistService.ts: the landing page waitlist (admins only). */
export const WAITLIST_PAGE_SIZE = 25;

export interface WaitlistRow {
  id: string;
  email: string;
  name: string | null;
  language: 'en' | 'so';
  /** When they ticked "I agree to the privacy policy" (required to join). */
  consentAt: string;
  source: string;
  createdAt: string;
}

export interface WaitlistPage {
  /** Everyone on the waitlist. */
  total: number;
  /** Rows matching the search (= total without a search). */
  matching: number;
  items: WaitlistRow[];
  page: number;
  limit: number;
}

export interface WaitlistFilters {
  q: string;
  page: number;
}

export function waitlistQuery(filters: WaitlistFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  params.set('page', String(filters.page));
  params.set('limit', String(WAITLIST_PAGE_SIZE));
  return params.toString();
}

export const fetchWaitlist = (request: Request, filters: WaitlistFilters) =>
  request<WaitlistPage>(`/admin/waitlist?${waitlistQuery(filters)}`);
