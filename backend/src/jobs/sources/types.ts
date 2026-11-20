import type { EmployerType } from '../../models/JobSource.js';
import type { RegionKey } from '../../models/Region.js';
import type { JOB_TYPES, WORK_MODES } from '../../models/Profile.js';
import type { Language } from '../../models/User.js';

/** What a research run asks every selected source for (doc 9 §5–6). */
export interface ResearchQuery {
  /** The user's chosen regions (default: Somaliland and Somalia). */
  regions: RegionKey[];
  /** Job titles or keywords, e.g. ["software developer"]. */
  titles: string[];
  skills: string[];
  city?: string;
  employerTypes: EmployerType[];
  /** Most jobs one source should return for this run. */
  limit: number;
}

/**
 * One job as every adapter must return it (doc 9 §6). Required: sourceKey,
 * externalId, title, employer, region, applyUrl. Jobs keep their original language.
 */
export interface NormalizedJob {
  sourceKey: string;
  externalId: string;
  title: string;
  employer: string;
  employerType: EmployerType;
  region: RegionKey;
  city?: string;
  /** A real link where the user applies (http or https). */
  applyUrl: string;
  /** Only when the source says it. */
  jobType?: (typeof JOB_TYPES)[number];
  workMode?: (typeof WORK_MODES)[number];
  deadline?: Date;
  language?: Language;
  description?: string;
}

/**
 * One file per source in this folder implements this interface. Adding a source
 * = one adapter file + one `jobSources` record (doc 9 §7); no app release.
 */
export interface SourceAdapter {
  /** Same as the `jobSources.key` of the source it serves. */
  key: string;
  search(query: ResearchQuery): Promise<NormalizedJob[]>;
}
