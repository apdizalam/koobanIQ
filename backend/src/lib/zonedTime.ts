/**
 * Calendar periods in the user's time zone (TIQ-20: "day boundaries follow the
 * user's timezone"), with the built-in Intl data only (no extra library).
 * The app sends the phone's IANA zone, e.g. "Africa/Mogadishu"; nothing is stored.
 */

export const REPORT_PERIODS = ['hour', 'day', 'week', 'month', 'year'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** Is this a time zone the server knows (IANA name or "UTC")? */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

interface Wall {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** The wall-clock time at `date` in `timeZone`. */
function wallTime(date: Date, timeZone: string): Wall {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Milliseconds the zone is ahead of UTC at `date` (e.g. +3 h for Africa/Mogadishu). */
function offsetAt(date: Date, timeZone: string) {
  const w = wallTime(date, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The instant when the wall clock in `timeZone` shows this local time.
 * Month and day may overflow (Date.UTC normalises them). Checked twice so a
 * daylight-saving change between the guess and the answer is handled.
 */
function zonedToUtc(
  timeZone: string,
  year: number,
  month: number,
  day = 1,
  hour = 0,
  minute = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let result = guess - offsetAt(new Date(guess), timeZone);
  const second = guess - offsetAt(new Date(result), timeZone);
  if (second !== result) result = second;
  return new Date(result);
}

/** Weekday 0 = Monday … 6 = Sunday of a local calendar date. */
const weekdayMon0 = (w: Wall) =>
  (new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay() + 6) % 7;

/**
 * The current period that contains `now`, and the one just before it, as
 * [start, end) instants, cut at the user's local boundaries: the hour, local
 * midnight, Monday 00:00, the 1st of the month, 1 January.
 */
export function periodRange(period: ReportPeriod, timeZone: string, now: Date) {
  const w = wallTime(now, timeZone);
  const at = (shift: number) => {
    switch (period) {
      case 'hour':
        return zonedToUtc(timeZone, w.year, w.month, w.day, w.hour + shift);
      case 'day':
        return zonedToUtc(timeZone, w.year, w.month, w.day + shift);
      case 'week':
        return zonedToUtc(timeZone, w.year, w.month, w.day - weekdayMon0(w) + 7 * shift);
      case 'month':
        return zonedToUtc(timeZone, w.year, w.month + shift);
      case 'year':
        return zonedToUtc(timeZone, w.year + shift, 1);
    }
  };
  return {
    start: at(0),
    end: at(1),
    previous: { start: at(-1), end: at(0) },
  };
}
