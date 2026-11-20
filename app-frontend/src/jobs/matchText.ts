import type { TFunction } from 'i18next';
import type { Job, JobMatchDetails, MatchReason } from '../types/jobs';
import type { JobMatch } from '../types/match';

/** Level and region keys inside reason values become words in the app language. */
function readableValues(values: MatchReason['values'], t: TFunction) {
  const out: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(values ?? {})) {
    if (value === null || value === undefined) {
      out[name] = t('mobile.jobs.level.unknown');
    } else if (name === 'jobLevel' || name === 'userLevel') {
      out[name] = t(`mobile.jobs.level.${value}` as 'mobile.jobs.level.entry');
    } else if (name === 'region') {
      out[name] = t(`common.region.${value}` as 'common.region.somalia');
    } else {
      out[name] = value;
    }
  }
  return out;
}

/** One reason for a score, as a sentence in the app language. */
export function reasonText(reason: MatchReason, t: TFunction): string {
  const key = `mobile.jobs.reasons.${reason.key}`;
  // A reason this app version doesn't know yet is left out rather than shown as a key.
  if (!t(key, { defaultValue: '' })) return '';
  return t(key as 'mobile.jobs.reasons.remote', readableValues(reason.values, t));
}

/** Every reason, in the order the server gave them, unknown ones left out. */
export const reasonTexts = (match: JobMatchDetails, t: TFunction) =>
  match.reasons.map((r) => reasonText(r, t)).filter(Boolean);

/** The badge on a job card: category text and the score. */
export const badgeOf = (match: JobMatchDetails, t: TFunction): JobMatch => ({
  category: match.category,
  label: t(`mobile.preview.matches.${match.category}`),
  score: match.score,
});

/** "Hargeisa, Somaliland", "Somalia" or "Remote". */
export const placeOf = (job: Job, t: TFunction) => {
  const region = t(`common.region.${job.region}`);
  return job.city ? `${job.city}, ${region}` : region;
};

/** Short "why" line for a card: the first two reasons. */
export const shortWhy = (match: JobMatchDetails, t: TFunction) =>
  reasonTexts(match, t).slice(0, 2).join(' ');

/** Only real web links are opened (never another kind of link from a source). */
export const isWebLink = (url: string) => /^https?:\/\/[^\s]+$/i.test(url);

/** The site a job came from, e.g. "boards.greenhouse.io" (empty if not a web link). */
export const hostOf = (url: string) => {
  try {
    return isWebLink(url) ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};
