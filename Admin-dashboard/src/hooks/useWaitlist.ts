import { useAuth } from '../auth/authContext';
import {
  fetchWaitlist,
  waitlistQuery,
  type WaitlistFilters,
  type WaitlistPage,
} from '../services/waitlistApi';
import { useLoad } from './useLoad';

/** One page of the waitlist for this search. */
export function useWaitlist(filters: WaitlistFilters) {
  const { request } = useAuth();
  return useLoad<WaitlistPage>(`waitlist:${waitlistQuery(filters)}`, () =>
    fetchWaitlist(request, filters),
  );
}
