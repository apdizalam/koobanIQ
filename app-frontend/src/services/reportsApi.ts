import { getCalendars } from 'expo-localization';
import type { Report, ReportPeriod } from '../types/report';
import { apiRequest } from './api';

/** The phone's time zone (e.g. "Africa/Mogadishu"), so days start at local midnight. */
export function deviceTimeZone(): string {
  try {
    const fromPhone = getCalendars()[0]?.timeZone;
    if (fromPhone) return fromPhone;
  } catch {
    // Fall through to Intl.
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** GET /reports: this period and the one before, in the phone's time zone. */
export const fetchReport = (
  accessToken: string,
  period: ReportPeriod,
  timeZone = deviceTimeZone(),
) =>
  apiRequest<{ report: Report }>(`/reports?period=${period}&tz=${encodeURIComponent(timeZone)}`, {
    accessToken,
  });
