/**
 * Staging smoke test (TIQ-25): the main user journey against a running API,
 * with a throwaway account and made-up data, then everything it made is deleted.
 *
 *   PowerShell:
 *     $env:SMOKE_API_URL = "https://kobaniq-api-staging.onrender.com/api/v1"
 *     $env:MONGODB_DB_NAME = "kobaniq_staging"      # the database that API uses
 *     npm.cmd run smoke -w backend
 *
 * Steps: sign up + log in → profile + skill → skill quiz to the end → job
 * description → CV → approve → PDF → job research (needs a job source switched
 * on in the admin) → log out. About 3 AI calls (quiz, job description, CV).
 *
 * The account is marked as a test account directly in the database (MONGODB_URI
 * + MONGODB_DB_NAME from backend/.env or the terminal), so the CV step may use
 * the AI with its made-up data. Nothing real is sent to the AI. Prints one line
 * per step; exit code 1 if a step failed. Passwords and tokens are never printed.
 */
import { randomBytes } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../lib/db.js';

const API = (process.env.SMOKE_API_URL ?? 'http://localhost:5000/api/v1').replace(/\/$/, '');
const RUN = randomBytes(4).toString('hex');
const EMAIL = `smoke-${RUN}@smoke.test.kobaniq.invalid`;
const PASSWORD = randomBytes(18).toString('base64url');

const JOB_AD = `Junior Web Developer — Hargeisa, Somaliland (full time)

Our company builds websites and mobile apps for local businesses. We are looking
for a junior web developer to join our small team.

Responsibilities:
- Build and maintain web pages with HTML, CSS and JavaScript
- Work with React on new features
- Fix bugs and write simple tests
- Work with the designer and the project manager

Requirements:
- 1–2 years of experience with JavaScript
- Basic knowledge of React and Git
- Good English; Somali is a plus

How to apply: send your CV and a short cover letter by 30 December.`;

type Step = { name: string; ok: boolean | 'blocked'; detail: string };
const steps: Step[] = [];
let token = '';
let refreshToken = '';

async function call(method: string, path: string, body?: unknown, timeoutMs = 120_000) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const type = res.headers.get('content-type') ?? '';
  const json = type.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const code = json?.error?.code ?? res.statusText;
    throw new Error(`${method} ${path} → ${res.status} ${code}`);
  }
  return { res, data: json?.data };
}

async function step(name: string, run: () => Promise<string | { blocked: string }>) {
  const started = Date.now();
  try {
    const result = await run();
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (typeof result === 'object') {
      steps.push({ name, ok: 'blocked', detail: result.blocked });
    } else {
      steps.push({ name, ok: true, detail: `${result} (${seconds}s)` });
    }
    return true;
  } catch (err) {
    steps.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

/** Every document this account made, in every collection that keeps a userId. */
async function deleteEverything(userId: Types.ObjectId) {
  const db = mongoose.connection.db!;
  let removed = 0;
  for (const { name } of await db.listCollections().toArray()) {
    if (name === 'users' || name.startsWith('system.')) continue;
    removed += (await db.collection(name).deleteMany({ userId })).deletedCount;
  }
  removed += (await db.collection('users').deleteOne({ _id: userId })).deletedCount;
  return removed;
}

async function main() {
  console.log(`API: ${API}\nDatabase for the test flag + cleanup: ${env.mongoDbName}\n`);
  await connectDB({ retries: 2 });
  const users = mongoose.connection.db!.collection('users');
  let userId: Types.ObjectId | null = null;

  try {
    const health = await step('API health', async () => {
      const { data } = await call('GET', '/health');
      if (data.db?.name && data.db.name !== env.mongoDbName) {
        throw new Error(
          `the API uses ${data.db.name}, this script ${env.mongoDbName}: set MONGODB_DB_NAME`,
        );
      }
      return `ok, database ${data.db?.name}`;
    });
    if (!health) return;

    const signedUp = await step('Sign up + log in', async () => {
      await call('POST', '/auth/register', {
        email: EMAIL,
        password: PASSWORD,
        ageConfirmed: true,
        preferredLanguage: 'en',
      });
      const user = await users.findOne({ email: EMAIL });
      if (!user) throw new Error('account not found in the database');
      userId = user._id as Types.ObjectId;
      // Made-up data only: allowed to use the AI like a test account.
      await users.updateOne({ _id: userId }, { $set: { testAccount: true } });
      const { data } = await call('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
      token = data.accessToken;
      refreshToken = data.refreshToken;
      return 'new account, signed in';
    });
    if (!signedUp) return;

    let skillId = '';
    await step('Profile + skill', async () => {
      await call('PATCH', '/profile/personal', {
        fullName: 'Smoke Test',
        contactEmail: 'cv.contact@smoke.test.kobaniq.invalid',
        region: 'somaliland',
        city: 'Hargeisa',
      });
      await call('POST', '/profile/experience', {
        title: 'Web Developer',
        employer: 'Example Ltd',
        startDate: '2023-01',
        description: 'Built websites with JavaScript and React.',
      });
      const { data } = await call('POST', '/skills', { name: 'JavaScript', selfLevel: 'mid' });
      skillId = data.skill.id;
      return 'name, contact email, experience, skill';
    });

    await step('Skill quiz (AI)', async () => {
      if (!skillId) throw new Error('no skill');
      let { data } = await call('POST', '/assessments', {
        skillId,
        difficulty: 'normal',
        language: 'en',
        length: 5,
      });
      let assessment = data.assessment;
      for (let i = 0; i < 10 && assessment.status === 'in_progress'; i += 1) {
        ({ data } = await call('POST', `/assessments/${assessment.id}/answers`, {
          questionId: assessment.question.id,
          choice: 0,
        }));
        assessment = data.assessment;
      }
      if (assessment.status !== 'finished') throw new Error(`quiz ended as ${assessment.status}`);
      return `finished, score ${assessment.result?.scorePercent}%`;
    });

    let cvId = '';
    await step('Job description (AI)', async () => {
      const { data } = await call('POST', '/job-descriptions', { text: JOB_AD });
      const jd = data.jobDescription;
      const { data: cv } = await call('POST', '/cvs/generate', {
        jobDescriptionId: jd.id,
        language: 'en',
      });
      cvId = cv.cv.id;
      return `"${jd.extracted?.title ?? '?'}"; CV draft made (AI)`;
    });

    await step('CV approve + PDF export', async () => {
      if (!cvId) throw new Error('no CV');
      await call('POST', `/cvs/${cvId}/approve`, {});
      const { res } = await call('GET', `/cvs/${cvId}/pdf`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('not a PDF');
      return `PDF ${Math.round(bytes.length / 1024)} KB`;
    });

    await step('Job research', async () => {
      const { data } = await call('GET', '/job-sources');
      const keys: string[] = data.sources.map((s: { key: string }) => s.key);
      if (keys.length === 0) {
        return { blocked: 'no job source is switched on (admin → Job sources)' };
      }
      const { data: started } = await call('POST', '/research/run', {
        sourceKeys: keys.filter((k) => k !== 'career-pages').slice(0, 3),
        filters: { titles: ['developer'] },
      });
      let run = started.run;
      for (let i = 0; i < 60 && run.status === 'running'; i += 1) {
        await new Promise((r) => setTimeout(r, 5000));
        run = (await call('GET', `/research/runs/${run.id}`)).data.run;
      }
      if (run.status === 'running') throw new Error('still running after 5 minutes');
      if (run.status === 'failed') throw new Error(`failed: ${run.error ?? 'all sources failed'}`);
      return `${run.status}, ${run.jobsFound} jobs found (${run.sourceKeys.join(', ')})`;
    });

    await step('Log out', async () => {
      await call('POST', '/auth/logout', { refreshToken });
      return 'session ended';
    });
  } finally {
    if (userId) {
      // The AI calls this run made (no content): which model answered, how many
      // calls, the provider's status word. Printed before the cleanup deletes them.
      const usage = await mongoose.connection
        .db!.collection('usagerecords')
        .find({ userId })
        .sort({ createdAt: 1 })
        .toArray();
      for (const u of usage) {
        console.log(
          `AI ${u.feature}: ${u.status} | model ${u.model}${u.fallbackUsed ? ' (second model)' : ''}` +
            ` | ${((u.durationMs ?? 0) / 1000).toFixed(1)}s | calls ${u.calls ?? '?'}` +
            ` | tokens ${u.inputTokens}/${u.outputTokens}` +
            (u.providerStatus ? ` | last provider status ${u.providerStatus}` : ''),
        );
      }
      const removed = await deleteEverything(userId);
      console.log(`Cleanup: deleted ${removed} records of the smoke account.\n`);
    }
    for (const s of steps) {
      const mark = s.ok === true ? 'OK     ' : s.ok === 'blocked' ? 'BLOCKED' : 'FAILED ';
      console.log(`${mark} ${s.name}: ${s.detail}`);
    }
    const failed = steps.filter((s) => s.ok === false).length;
    console.log(failed === 0 ? '\nSmoke test passed.' : `\n${failed} step(s) failed.`);
    if (failed > 0) process.exitCode = 1;
    await disconnectDB();
  }
}

main().catch(async (err) => {
  console.error('Smoke test stopped:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
  await disconnectDB().catch(() => undefined);
});
