import type { EmployerType } from '../../models/JobSource.js';
import type { RegionKey } from '../../models/Region.js';

/** Why a listed source cannot be searched (shown to users, in their language). */
export const UNAVAILABLE_REASONS = [
  /** The source's free API needs an approval we are waiting for (ReliefWeb app name). */
  'needs_approval',
  /** No free, permitted way to read its public jobs (no API; terms restrict scraping). */
  'no_free_api',
  /** Its terms do not allow our use without the source's written permission. */
  'needs_permission',
  /** Its terms could not be checked yet. */
  'terms_unverified',
  /** Free and permitted, but its jobs are not open to candidates in Somaliland / Somalia. */
  'not_relevant',
  /** Built and permitted, but not switched on yet (an admin enables it after its live check). */
  'not_enabled',
] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

interface CatalogEntry {
  key: string;
  name: string;
  type: 'job_board' | 'ngo_un' | 'employer' | 'government' | 'partner';
  connection: 'api' | 'feed' | 'manual_import';
  regions: RegionKey[];
  employerTypes: EmployerType[];
  website: string;
  termsUrl?: string;
  /** Shown to users even when it cannot be searched (with the reason). */
  listed: true;
  unavailableReason?: UnavailableReason;
  /** Name to credit on every job from it ("via Arbeitnow"), when its terms ask for it. */
  attribution?: string;
  /** Searches the career-page links the user gives. */
  acceptsUrls?: boolean;
  termsCheckedAt?: Date;
  rateLimitPerMinute?: number;
  priority: number;
}

/**
 * The starting catalog (owner's job research brief, 2026-11-20). Added at server
 * start when missing; never overwrites what an admin changed. Every source
 * starts switched off; an admin switches on only those that pass the live check
 * (`npm run jobs:check -w backend`). Terms were checked on 2026-11-20 (see Notion
 * TIQ-32); sources without a free, permitted access stay listed with the reason.
 */
export const DEFAULT_SOURCES: CatalogEntry[] = [
  {
    key: 'career-pages',
    name: 'Company & NGO career pages (your links)',
    type: 'employer',
    connection: 'api',
    regions: ['somaliland', 'somalia', 'remote'],
    employerTypes: ['company', 'ngo', 'un_agency', 'government', 'education', 'health', 'other'],
    website: 'https://schema.org/JobPosting',
    listed: true,
    acceptsUrls: true,
    // Official public job-board APIs (Greenhouse, Lever, SmartRecruiters) and
    // the job data pages publish for search engines (schema.org JobPosting),
    // only where the site's robots.txt allows it.
    termsCheckedAt: new Date('2026-11-20T00:00:00Z'),
    priority: 10,
  },
  {
    key: 'reliefweb',
    name: 'ReliefWeb',
    type: 'ngo_un',
    connection: 'api',
    regions: ['somaliland', 'somalia'],
    employerTypes: ['ngo', 'un_agency'],
    website: 'https://reliefweb.int/jobs',
    termsUrl: 'https://apidoc.reliefweb.int',
    listed: true,
    unavailableReason: 'needs_approval',
    priority: 20,
  },
  {
    key: 'arbeitnow',
    name: 'Arbeitnow (remote jobs)',
    type: 'job_board',
    connection: 'api',
    regions: ['remote'],
    employerTypes: ['company'],
    website: 'https://www.arbeitnow.com',
    termsUrl: 'https://www.arbeitnow.com/terms',
    listed: true,
    // Checked live 2026-11-20: its "remote" jobs are German roles (often in German,
    // with work or travel in Germany), not open to candidates in Somaliland / Somalia.
    unavailableReason: 'not_relevant',
    attribution: 'Arbeitnow',
    termsCheckedAt: new Date('2026-11-20T00:00:00Z'),
    priority: 40,
  },
  {
    key: 'un-careers',
    name: 'UN Careers',
    type: 'ngo_un',
    connection: 'feed',
    regions: ['somaliland', 'somalia'],
    employerTypes: ['un_agency'],
    website: 'https://careers.un.org',
    listed: true,
    unavailableReason: 'terms_unverified',
    priority: 30,
  },
  {
    key: 'remotive',
    name: 'Remotive (remote jobs)',
    type: 'job_board',
    connection: 'api',
    regions: ['remote'],
    employerTypes: ['company'],
    website: 'https://remotive.com',
    termsUrl: 'https://github.com/remotive-io/remote-jobs-api',
    listed: true,
    // Its terms forbid showing its jobs to collect sign-ups; KOBANIQ shows jobs
    // only in signed-in accounts, and commercial use is a paid API.
    unavailableReason: 'needs_permission',
    priority: 50,
  },
  {
    key: 'linkedin',
    name: 'LinkedIn',
    type: 'job_board',
    connection: 'api',
    regions: ['somaliland', 'somalia', 'remote'],
    employerTypes: ['company', 'ngo', 'un_agency', 'government', 'education', 'health', 'other'],
    website: 'https://www.linkedin.com/jobs',
    termsUrl: 'https://developer.linkedin.com/legal/api-terms-of-use',
    listed: true,
    unavailableReason: 'no_free_api',
    priority: 60,
  },
  {
    key: 'facebook',
    name: 'Facebook',
    type: 'job_board',
    connection: 'api',
    regions: ['somaliland', 'somalia'],
    employerTypes: ['company', 'ngo', 'other'],
    website: 'https://www.facebook.com',
    listed: true,
    unavailableReason: 'no_free_api',
    priority: 70,
  },
];
