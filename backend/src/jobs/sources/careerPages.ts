import { getJson, robotsAllows, safeGet, UnsafeUrlError } from '../http.js';
import { htmlToText, resolveRegion } from '../text.js';
import type { NormalizedJob, ResearchQuery, SourceAdapter } from './types.js';

/**
 * "Company & NGO career pages (your links)" (owner's brief: custom public
 * career-site URLs). Free and permitted ways only:
 * - Greenhouse, Lever and SmartRecruiters links → their official public
 *   job-board APIs (made for showing an employer's openings);
 * - any other page → only if its robots.txt allows us, and only the job data
 *   it publishes for search engines (schema.org JobPosting, JSON-LD).
 * Never logs in, never reads private content. Each link on its own: one link
 * failing doesn't stop the others. Jobs outside Somaliland, Somalia or remote
 * are left out (no region), and only real http(s) apply links are kept.
 */
export const CAREER_PAGES_KEY = 'career-pages';
/** Most links one search can take. */
export const MAX_CUSTOM_URLS = 5;

type Job = Omit<NormalizedJob, 'region' | 'city'> & { location: string; remote: boolean };

const JOB_TYPE: Record<string, NormalizedJob['jobType']> = {
  full_time: 'full_time',
  fulltime: 'full_time',
  'full-time': 'full_time',
  'full time': 'full_time',
  permanent: 'full_time',
  part_time: 'part_time',
  parttime: 'part_time',
  'part-time': 'part_time',
  'part time': 'part_time',
  contract: 'contract',
  contractor: 'contract',
  temporary: 'contract',
  intern: 'internship',
  internship: 'internship',
  volunteer: 'volunteer',
};
const jobTypeOf = (value: unknown) =>
  typeof value === 'string' ? JOB_TYPE[value.trim().toLowerCase()] : undefined;

const date = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const pretty = (token: string) =>
  token
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

// ------------------------------------------------------------------ Greenhouse

interface GhJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
}
async function greenhouse(token: string): Promise<Job[]> {
  const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}`;
  const [board, list] = await Promise.all([
    getJson<{ name?: string }>(base).catch(() => ({ name: undefined })),
    getJson<{ jobs?: GhJob[] }>(`${base}/jobs?content=true`),
  ]);
  return (list.jobs ?? []).map((j) => ({
    sourceKey: CAREER_PAGES_KEY,
    externalId: `greenhouse:${token}:${j.id}`,
    title: j.title,
    employer: board.name?.trim() || pretty(token),
    employerType: 'other',
    applyUrl: j.absolute_url,
    description: htmlToText(j.content),
    location: j.location?.name ?? '',
    remote: /remote/i.test(j.location?.name ?? ''),
  }));
}

// ------------------------------------------------------------------ Lever

interface LeverPosting {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl?: string;
  descriptionPlain?: string;
  createdAt?: number;
  workplaceType?: string;
  categories?: { location?: string; commitment?: string };
}
async function lever(site: string, eu: boolean): Promise<Job[]> {
  const host = eu ? 'api.eu.lever.co' : 'api.lever.co';
  const list = await getJson<LeverPosting[]>(
    `https://${host}/v0/postings/${encodeURIComponent(site)}?mode=json&limit=100`,
  );
  return (Array.isArray(list) ? list : []).map((p) => ({
    sourceKey: CAREER_PAGES_KEY,
    externalId: `lever:${site}:${p.id}`,
    title: p.text,
    employer: pretty(site),
    employerType: 'other',
    applyUrl: p.hostedUrl || p.applyUrl || '',
    description: p.descriptionPlain ?? '',
    jobType: jobTypeOf(p.categories?.commitment),
    postedAt: date(p.createdAt),
    location: p.categories?.location ?? '',
    remote: p.workplaceType === 'remote',
  }));
}

// ------------------------------------------------------------------ SmartRecruiters

interface SrPosting {
  id: string;
  name: string;
  releasedDate?: string;
  company?: { name?: string };
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
  typeOfEmployment?: { label?: string };
}
async function smartRecruiters(company: string): Promise<Job[]> {
  const list = await getJson<{ content?: SrPosting[] }>(
    `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(company)}/postings?limit=100`,
  );
  return (list.content ?? []).map((p) => ({
    sourceKey: CAREER_PAGES_KEY,
    externalId: `smartrecruiters:${company}:${p.id}`,
    title: p.name,
    employer: p.company?.name?.trim() || pretty(company),
    employerType: 'other',
    applyUrl: `https://jobs.smartrecruiters.com/${encodeURIComponent(company)}/${encodeURIComponent(p.id)}`,
    jobType: jobTypeOf(p.typeOfEmployment?.label),
    postedAt: date(p.releasedDate),
    location: [p.location?.city, p.location?.region, p.location?.country]
      .filter(Boolean)
      .join(', '),
    remote: p.location?.remote === true,
  }));
}

// ------------------------------------------------------------------ JobPosting pages

/** Every schema.org JobPosting object in the page's JSON-LD blocks (incl. @graph and lists). */
export function jobPostingsInHtml(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const blocks = html.matchAll(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const type = obj['@type'];
    if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting')))
      out.push(obj);
    if (obj['@graph']) visit(obj['@graph']);
    if (obj.itemListElement) visit(obj.itemListElement);
    if (obj.item) visit(obj.item);
  };
  for (const block of blocks) {
    try {
      visit(JSON.parse(block[1].trim()));
    } catch {
      // A broken block on the page is skipped, never guessed at.
    }
  }
  return out;
}

const text = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'name' in value
      ? text((value as { name: unknown }).name)
      : '';

function postingLocation(p: Record<string, unknown>) {
  const places = Array.isArray(p.jobLocation)
    ? p.jobLocation
    : p.jobLocation
      ? [p.jobLocation]
      : [];
  return places
    .map((place) => {
      const address = (place as { address?: Record<string, unknown> })?.address;
      if (!address) return text(place);
      if (typeof address === 'string') return address;
      return [address.addressLocality, address.addressRegion, text(address.addressCountry)]
        .filter((v) => typeof v === 'string' && v)
        .join(', ');
    })
    .join('; ');
}

async function jobPostingPage(pageUrl: string): Promise<Job[]> {
  if (!(await robotsAllows(pageUrl))) {
    throw new Error('the site’s robots.txt does not allow it');
  }
  const res = await safeGet(pageUrl, 'text/html');
  if (res.status !== 200) throw new Error(`the page answered ${res.status}`);
  const postings = jobPostingsInHtml(res.body);
  if (postings.length === 0) throw new Error('no job data published on this page');
  return postings.map((p, i) => {
    const identifier = p.identifier as { value?: unknown } | string | undefined;
    const id =
      (typeof identifier === 'object' ? text(identifier?.value) : text(identifier)) ||
      text(p.url) ||
      `${res.url}#${i}`;
    const types = Array.isArray(p.employmentType) ? p.employmentType : [p.employmentType];
    return {
      sourceKey: CAREER_PAGES_KEY,
      externalId: `page:${new URL(res.url).hostname}:${id}`,
      title: text(p.title),
      employer: text(p.hiringOrganization),
      employerType: 'other',
      // The posting's own link when it has one, else the page it was found on.
      applyUrl: (typeof p.url === 'string' && /^https?:\/\//.test(p.url)
        ? p.url
        : res.url) as string,
      description: htmlToText(text(p.description)),
      jobType: types.map(jobTypeOf).find(Boolean),
      deadline: date(p.validThrough),
      postedAt: date(p.datePosted),
      location: postingLocation(p),
      remote: p.jobLocationType === 'TELECOMMUTE',
    };
  });
}

// ------------------------------------------------------------------ the adapter

/** Which way a link is read: an official board API, or a page with job data. */
export function detectProvider(raw: string) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const [first] = url.pathname.split('/').filter(Boolean);
  if (/^(boards|job-boards)(\.eu)?\.greenhouse\.io$/.test(host)) {
    const token = url.searchParams.get('for') ?? (first === 'embed' ? null : first);
    if (token) return { kind: 'greenhouse' as const, token };
  }
  if (/^jobs(\.eu)?\.lever\.co$/.test(host) && first) {
    return { kind: 'lever' as const, token: first, eu: host.startsWith('jobs.eu.') };
  }
  if (/^(careers|jobs)\.smartrecruiters\.com$/.test(host) && first) {
    return { kind: 'smartrecruiters' as const, token: first };
  }
  return { kind: 'page' as const, token: raw };
}

/** Reads one link (exported for the live check, npm run jobs:check). */
export async function readCareerLink(raw: string): Promise<Job[]> {
  const p = detectProvider(raw);
  if (p.kind === 'greenhouse') return greenhouse(p.token);
  if (p.kind === 'lever') return lever(p.token, !!p.eu);
  if (p.kind === 'smartrecruiters') return smartRecruiters(p.token);
  return jobPostingPage(raw);
}

export const careerPagesAdapter: SourceAdapter = {
  key: CAREER_PAGES_KEY,
  async search(query: ResearchQuery) {
    const links = (query.customUrls ?? []).slice(0, MAX_CUSTOM_URLS);
    if (links.length === 0) throw new Error('No career-page link was given');
    const failures: string[] = [];
    const found: NormalizedJob[] = [];
    await Promise.all(
      links.map(async (link) => {
        try {
          const jobs = (await readCareerLink(link)).slice(0, query.limit);
          for (const job of jobs) {
            const place = await resolveRegion(job.location, job.remote);
            // Outside our regions: not kept (keepValidJobs counts it as invalid).
            const { location: _location, remote: _remote, ...rest } = job;
            void _location;
            void _remote;
            found.push({ ...rest, region: place?.region ?? ('' as never), city: place?.city });
          }
        } catch (err) {
          const why = err instanceof UnsafeUrlError ? err.reason : (err as Error).message;
          failures.push(`${new URL(link).hostname}: ${why}`);
          console.warn(`[research] career page ${link}: ${why}`);
        }
      }),
    );
    // Only when every link failed does the source count as failed (with the reasons).
    if (found.length === 0 && failures.length === links.length)
      throw new Error(failures.join('; '));
    return found;
  },
};
