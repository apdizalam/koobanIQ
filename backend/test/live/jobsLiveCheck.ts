/**
 * Job sources live check: npm run jobs:check -w backend
 *
 * Calls each free, permitted way the "career pages" source reads links, once,
 * against a well-known public employer board per provider (public job
 * listings only, no user data), and shows what our adapter makes of the real
 * answer. A source is only called "working" after this passes; an admin then
 * switches it on in the Admin Dashboard. Not part of `npm test`.
 * Needs MongoDB (region city lists): run with the backend .env.
 */
import { connectDB, disconnectDB } from '../../src/lib/db.js';
import { readCareerLink } from '../../src/jobs/sources/careerPages.js';
import { resolveRegion } from '../../src/jobs/text.js';
import { ensureDefaultRegions } from '../../src/services/jobSourceService.js';

const BOARDS: [string, string][] = [
  ['Greenhouse board API', 'https://boards.greenhouse.io/gitlab'],
  ['Lever postings API', 'https://jobs.lever.co/palantir'],
  ['SmartRecruiters posting API', 'https://careers.smartrecruiters.com/BoschGroup'],
];

async function run() {
  await connectDB({ retries: 1 });
  await ensureDefaultRegions();
  let failures = 0;
  for (const [name, link] of BOARDS) {
    const started = Date.now();
    try {
      const jobs = await readCareerLink(link);
      const usable = jobs.filter((j) => j.title && j.employer && /^https?:\/\//.test(j.applyUrl));
      let inRegion = 0;
      for (const j of jobs) if (await resolveRegion(j.location, j.remote)) inRegion += 1;
      const sample = usable[0];
      const ok = jobs.length > 0 && usable.length === jobs.length;
      if (!ok) failures += 1;
      console.log(
        `${ok ? 'OK   ' : 'CHECK'} ${name.padEnd(28)} ${Date.now() - started} ms · ${jobs.length} jobs read · ` +
          `${usable.length} with title, employer and a real apply link · ${inRegion} in Somaliland / Somalia / remote` +
          (sample
            ? `\n      sample: ${sample.title} · ${sample.employer} · ${sample.location || '(no place)'} · ${sample.applyUrl}`
            : ''),
      );
    } catch (err) {
      failures += 1;
      console.log(`FAIL  ${name.padEnd(28)} ${(err as Error).message}`);
    }
  }
  console.log(`\n${BOARDS.length - failures}/${BOARDS.length} readable`);
  await disconnectDB();
  if (failures > 0) process.exitCode = 1;
}

void run();
