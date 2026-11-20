import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import {
  checkUrlForm,
  clearRobotsCache,
  httpSettings,
  isPrivateAddress,
  parseRobots,
  robotsAllowPath,
} from '../src/jobs/http.js';
import { detectProvider, jobPostingsInHtml } from '../src/jobs/sources/careerPages.js';
import { clearRegionCache, htmlToText, resolveRegion } from '../src/jobs/text.js';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import { Job } from '../src/models/Job.js';
import { JobSource } from '../src/models/JobSource.js';
import { Region } from '../src/models/Region.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { ResearchRun } from '../src/models/ResearchRun.js';
import { User } from '../src/models/User.js';
import { ensureDefaultRegions, ensureDefaultSources } from '../src/services/jobSourceService.js';
import { researchSettings } from '../src/services/researchService.js';
import { RUN_ID } from './support/testRun.js';

// Public job research from the user's career-page links (owner brief, slice 2).
// A local test website stands in for real sites; Greenhouse and Lever answers
// are fixtures. Nothing here contacts a real site.
const DB_NAME = `kobaniq_test_careerpages_${RUN_ID}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper reads any answer
type Json = any;

let api: Server;
let site: Server;
let apiUrl: string;
let siteUrl: string;
let token: string;
const realFetch = globalThis.fetch;
const siteHits: string[] = [];

const posting = (
  n: number,
  locality: string,
  country: string,
  extra: Record<string, unknown> = {},
) => ({
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: `Data Officer ${n}`,
  identifier: { '@type': 'PropertyValue', value: `job-${n}` },
  url: `https://careers.example-ngo.invalid/jobs/${n}`,
  hiringOrganization: { '@type': 'Organization', name: 'Example Relief NGO' },
  datePosted: '2026-11-10',
  validThrough: '2026-12-31',
  employmentType: 'FULL_TIME',
  description:
    '&lt;p&gt;Requirements: 2 years of experience. Excel &amp; report writing.&lt;/p&gt;',
  jobLocation: {
    '@type': 'Place',
    address: { addressLocality: locality, addressCountry: country },
  },
  ...extra,
});

const pageWith = (data: unknown) =>
  `<html><head><title>Careers</title><script type="application/ld+json">${JSON.stringify(data)}</script>
   <script type="application/ld+json">{ broken json </script></head><body>Jobs</body></html>`;

before(async () => {
  researchSettings.retryBaseMs = 5;
  httpSettings.allowPrivateForTests = true; // the test website runs on 127.0.0.1
  await connectDB({ dbName: DB_NAME, retries: 2 });
  await mongoose.connection.dropDatabase();
  await Promise.all(
    [User, RefreshToken, Job, JobSource, Region, ResearchRun].map((m) => m.syncIndexes()),
  );
  await ensureDefaultRegions();
  await ensureDefaultSources();
  clearRegionCache();

  site = createServer((req, res) => {
    siteHits.push(req.url ?? '');
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('User-agent: *\nDisallow: /private\n\nUser-agent: BadBot\nDisallow: /\n');
    }
    if (req.url === '/careers') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(
        pageWith({
          '@graph': [
            posting(1, 'Hargeisa', 'Somaliland'),
            posting(2, 'Nairobi', 'Kenya'),
            posting(3, '', '', { jobLocationType: 'TELECOMMUTE', jobLocation: undefined }),
          ],
        }),
      );
    }
    if (req.url === '/private/careers') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(pageWith(posting(9, 'Hargeisa', 'Somaliland')));
    }
    if (req.url === '/no-data') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end('<html><body>No structured data</body></html>');
    }
    res.writeHead(404);
    res.end();
  }).listen(0);
  await new Promise<void>((resolve) => site.once('listening', () => resolve()));
  siteUrl = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;

  // Official board APIs: fixture answers, so no real site is contacted.
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    if (url === 'https://boards-api.greenhouse.io/v1/boards/examplengo')
      return json({ name: 'Example NGO' });
    if (url === 'https://boards-api.greenhouse.io/v1/boards/examplengo/jobs?content=true') {
      return json({
        jobs: [
          {
            id: 11,
            title: 'Finance Assistant',
            absolute_url: 'https://boards.greenhouse.io/examplengo/jobs/11',
            location: { name: 'Mogadishu, Somalia' },
            content: '&lt;p&gt;Requirements: accounting and Excel.&lt;/p&gt;',
          },
          {
            id: 12,
            title: 'Driver',
            absolute_url: 'https://boards.greenhouse.io/examplengo/jobs/12',
            location: { name: 'Berlin' },
          },
        ],
      });
    }
    if (url === 'https://api.lever.co/v0/postings/examplecorp?mode=json&limit=100') {
      return json([
        {
          id: 'abc',
          text: 'Remote Support Agent',
          hostedUrl: 'https://jobs.lever.co/examplecorp/abc',
          descriptionPlain: 'Customer service.',
          workplaceType: 'remote',
          createdAt: Date.parse('2026-11-01'),
          categories: { location: 'Remote', commitment: 'Full-time' },
        },
      ]);
    }
    return realFetch(input as string, init);
  }) as typeof fetch;

  api = createApp().listen(0);
  await new Promise<void>((resolve) => api.once('listening', () => resolve()));
  apiUrl = `http://127.0.0.1:${(api.address() as AddressInfo).port}/api/v1`;
  const email = 'amina@careerpages.invalid';
  await realFetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-horse-32', ageConfirmed: true }),
  });
  const login = await realFetch(`${apiUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct-horse-32' }),
  });
  token = ((await login.json()) as Json).data.accessToken;
  // An admin would switch it on after the live check.
  await JobSource.updateOne({ key: 'career-pages' }, { enabled: true });
});

beforeEach(() => {
  siteHits.length = 0;
  clearRobotsCache();
});

after(async () => {
  globalThis.fetch = realFetch;
  httpSettings.allowPrivateForTests = false;
  api.close();
  site.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

const call = async (method: string, path: string, body?: unknown) => {
  const res = await realFetch(`${apiUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : {}) as Json };
};

async function research(customUrls: string[]) {
  const started = await call('POST', '/research/run', { sourceKeys: ['career-pages'], customUrls });
  assert.equal(started.status, 202, JSON.stringify(started.body));
  for (let i = 0; i < 300; i += 1) {
    const r = await call('GET', `/research/runs/${started.body.data.run.id}`);
    if (r.body.data.run.status !== 'running') return r.body.data;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('run did not finish');
}

// ------------------------------------------------------------------ link safety (no network)

test('unsafe links are refused: other schemes, passwords, private and internal addresses', () => {
  httpSettings.allowPrivateForTests = false;
  try {
    for (const bad of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'ftp://example.org/jobs',
      'https://user:pass@example.org/jobs',
      'http://localhost/careers',
      'http://127.0.0.1/careers',
      'http://10.0.0.5/careers',
      'http://192.168.1.1/careers',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/careers',
      'https://example.org:8443/careers',
      'http://intranet/careers',
      'not a link',
    ]) {
      assert.throws(() => checkUrlForm(bad), /can't be used/, bad);
    }
    assert.equal(checkUrlForm('https://careers.example.org/jobs').hostname, 'careers.example.org');
  } finally {
    httpSettings.allowPrivateForTests = true;
  }
  for (const ip of [
    '10.1.2.3',
    '172.20.0.1',
    '100.64.0.1',
    '::ffff:192.168.0.1',
    'fd00::1',
    'fe80::1',
  ]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '2001:4860:4860::8888'])
    assert.equal(isPrivateAddress(ip), false, ip);
});

test('robots.txt: our group or "*", longest rule wins, Allow wins a tie', () => {
  const rules = parseRobots(
    'User-agent: *\nDisallow: /private\nAllow: /private/public\n\nUser-agent: other\nDisallow: /',
  );
  assert.equal(robotsAllowPath(rules, '/careers'), true);
  assert.equal(robotsAllowPath(rules, '/private/x'), false);
  assert.equal(robotsAllowPath(rules, '/private/public/jobs'), true);
  const ours = parseRobots(
    'User-agent: *\nAllow: /\n\nUser-agent: KOBANIQ-JobResearch\nDisallow: /jobs',
  );
  assert.equal(robotsAllowPath(ours, '/jobs'), false, 'a group for us wins over "*"');
});

test('job data published on a page is read; broken blocks are skipped, never guessed', () => {
  const html = pageWith({
    '@graph': [posting(1, 'Hargeisa', 'Somaliland'), { '@type': 'Organization' }],
  });
  const found = jobPostingsInHtml(html);
  assert.equal(found.length, 1);
  assert.equal(found[0].title, 'Data Officer 1');
  assert.equal(htmlToText('&lt;p&gt;Excel &amp;amp; Word&lt;/p&gt;'), 'Excel & Word');
});

test('links are read the right way: official board APIs, else the page', () => {
  assert.deepEqual(detectProvider('https://boards.greenhouse.io/examplengo'), {
    kind: 'greenhouse',
    token: 'examplengo',
  });
  assert.deepEqual(detectProvider('https://job-boards.greenhouse.io/embed/job_board?for=abc'), {
    kind: 'greenhouse',
    token: 'abc',
  });
  assert.deepEqual(detectProvider('https://jobs.lever.co/examplecorp'), {
    kind: 'lever',
    token: 'examplecorp',
    eu: false,
  });
  assert.deepEqual(detectProvider('https://careers.smartrecruiters.com/ExampleCo'), {
    kind: 'smartrecruiters',
    token: 'ExampleCo',
  });
  assert.equal(detectProvider('https://www.example-ngo.org/careers').kind, 'page');
});

test('a job’s place maps to our regions from the admin city lists; others are left out', async () => {
  assert.deepEqual(await resolveRegion('Hargeisa, Somaliland'), {
    region: 'somaliland',
    city: 'Hargeisa',
  });
  assert.deepEqual(await resolveRegion('Mogadishu, Somalia'), {
    region: 'somalia',
    city: 'Mogadishu',
  });
  assert.deepEqual(await resolveRegion('Somaliland'), { region: 'somaliland' });
  assert.deepEqual(await resolveRegion('', true), { region: 'remote' });
  assert.equal(await resolveRegion('Nairobi, Kenya'), null);
  // Remote only when nothing restricts it to another place.
  assert.deepEqual(await resolveRegion('Remote'), { region: 'remote' });
  assert.deepEqual(await resolveRegion('Remote - Worldwide'), { region: 'remote' });
  assert.deepEqual(await resolveRegion('Remote (Africa / EMEA)'), { region: 'remote' });
  assert.equal(await resolveRegion('Remote, United States'), null);
  assert.equal(await resolveRegion('Remote - Germany', true), null);
});

// ------------------------------------------------------------------ end to end

test('End Test: a career page link → only its real jobs in our regions are stored, with their links', async () => {
  const data = await research([`${siteUrl}/careers`]);
  assert.equal(data.run.status, 'completed');
  const pages = data.run.perSource[0];
  assert.equal(pages.key, 'career-pages');
  assert.equal(pages.found, 3);
  assert.equal(pages.invalid, 1, 'the Nairobi job is outside our regions');
  const jobs = [...data.recommended, ...data.lowerMatch].map((i: Json) => i.job);
  assert.deepEqual(jobs.map((j: Json) => j.region).sort(), ['remote', 'somaliland']);
  const hargeisa = jobs.find((j: Json) => j.region === 'somaliland');
  assert.equal(hargeisa.city, 'Hargeisa');
  assert.equal(hargeisa.employer, 'Example Relief NGO');
  assert.equal(hargeisa.applyUrl, 'https://careers.example-ngo.invalid/jobs/1');
  assert.equal(hargeisa.jobType, 'full_time');
  assert.equal(hargeisa.postedAt.slice(0, 10), '2026-11-10', 'the date the source gives');
  assert.equal(hargeisa.deadline.slice(0, 10), '2026-12-31');
  assert.ok(siteHits.includes('/robots.txt'), 'robots.txt was checked first');

  // Same page again: stored once.
  const before = await Job.countDocuments();
  const again = await research([`${siteUrl}/careers`]);
  assert.equal(await Job.countDocuments(), before);
  assert.equal(again.run.perSource[0].new, 0);
});

test('End Test: robots.txt is respected; one bad link does not stop the others', async () => {
  const data = await research([`${siteUrl}/private/careers`, `${siteUrl}/careers`]);
  assert.equal(data.run.status, 'completed');
  assert.equal(siteHits.includes('/private/careers'), false, 'a disallowed page is never fetched');
  assert.equal(data.run.perSource[0].found, 3);

  const blocked = await research([`${siteUrl}/private/careers`, `${siteUrl}/no-data`]);
  assert.equal(blocked.run.status, 'failed');
  assert.match(blocked.run.perSource[0].error, /robots\.txt/);
  assert.match(blocked.run.perSource[0].error, /no job data/);
});

test('End Test: official board links (Greenhouse, Lever) are read through their public APIs', async () => {
  const data = await research([
    'https://boards.greenhouse.io/examplengo',
    'https://jobs.lever.co/examplecorp',
  ]);
  assert.equal(data.run.status, 'completed');
  const jobs = [...data.recommended, ...data.lowerMatch].map((i: Json) => i.job);
  const finance = jobs.find((j: Json) => j.title === 'Finance Assistant');
  assert.equal(finance.employer, 'Example NGO');
  assert.equal(finance.region, 'somalia');
  assert.equal(finance.applyUrl, 'https://boards.greenhouse.io/examplengo/jobs/11');
  const remote = jobs.find((j: Json) => j.title === 'Remote Support Agent');
  assert.equal(remote.region, 'remote');
  assert.equal(remote.jobType, 'full_time');
  assert.equal(
    jobs.some((j: Json) => j.title === 'Driver'),
    false,
    'Berlin is outside our regions',
  );
});

test('the request checks links and the source together', async () => {
  for (const [body, detail] of [
    [{ sourceKeys: ['career-pages'] }, 'customUrlsRequired'],
    [{ sourceKeys: ['career-pages'], customUrls: ['file:///etc/passwd'] }, 'customUrlUnsafe'],
    [
      {
        sourceKeys: ['career-pages'],
        customUrls: Array.from({ length: 6 }, (_, i) => `https://e${i}.org`),
      },
      'customUrlsInvalid',
    ],
  ] as const) {
    const res = await call('POST', '/research/run', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok(res.body.meta.details.customUrls, detail);
  }
  const linkedin = await call('POST', '/research/run', { sourceKeys: ['linkedin'] });
  assert.equal(linkedin.status, 400);
  assert.equal(linkedin.body.error.code, 'SOURCE_NOT_AVAILABLE');
});

test('End Test: the app sees which sources work and why the others do not', async () => {
  const list = (await call('GET', '/job-sources')).body.data;
  const working = list.sources.map((s: Json) => s.key);
  assert.deepEqual(working, ['career-pages']);
  assert.equal(list.sources[0].acceptsUrls, true);
  const reasons = Object.fromEntries(list.unavailable.map((s: Json) => [s.key, s.reason]));
  assert.deepEqual(reasons, {
    reliefweb: 'needs_approval',
    'un-careers': 'terms_unverified',
    arbeitnow: 'not_relevant',
    remotive: 'needs_permission',
    linkedin: 'no_free_api',
    facebook: 'no_free_api',
  });
  assert.ok(list.unavailable.every((s: Json) => s.status === 'unavailable'));
});
