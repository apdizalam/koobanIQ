import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchJob } from '../src/jobs/match/score.js';
import {
  experienceYears,
  jobCareerLevel,
  jobSkills,
  requiredYears,
  userCareerLevel,
  type JobSignalsInput,
  type UserSignals,
} from '../src/jobs/match/signals.js';

// TIQ-17: the matcher, with fictional profiles and job ads. No database, no AI.
const NOW = new Date('2026-11-20T00:00:00Z');

const user = (over: Partial<UserSignals> = {}): UserSignals => ({
  skills: [
    { name: 'Microsoft Excel', selfLevel: 'mid', assessedLevel: 'advanced' },
    { name: 'Report writing', selfLevel: 'mid', assessedLevel: null },
  ],
  // Two years in total (2024-11 → now).
  experience: [{ title: 'Data clerk', startDate: '2024-11', endDate: null }],
  projectSkills: [],
  certifications: [],
  headline: 'Data clerk',
  preferences: {
    titles: ['Data Officer'],
    regions: ['somaliland'],
    cities: ['Hargeisa'],
    employerTypes: ['ngo'],
    jobTypes: ['full_time'],
    workModes: [],
  },
  ...over,
});

const job = (over: Partial<JobSignalsInput> = {}): JobSignalsInput => ({
  title: 'Data Officer',
  description: [
    'Responsibilities:',
    'Collect and clean monthly data.',
    'Requirements:',
    '- At least two (2) years of relevant work experience.',
    '- Excel and report writing skills.',
    'Desirable:',
    '- SPSS is an advantage.',
  ].join('\n'),
  region: 'somaliland',
  city: 'Hargeisa',
  employerType: 'ngo',
  jobType: 'full_time',
  ...over,
});

const ctx = { regions: ['somaliland'], now: NOW };

test('experience years: overlapping jobs count once; a current job runs to today', () => {
  assert.equal(
    experienceYears(
      [
        { title: 'A', startDate: '2020-01', endDate: '2021-12' },
        { title: 'B', startDate: '2021-06', endDate: '2022-12' },
        { title: 'C', startDate: '2025-11', endDate: null },
      ],
      NOW,
    ),
    4.1, // 36 months + 13 (2025-11 to 2026-11, this month included) = 49 months
  );
  assert.equal(experienceYears([], NOW), 0);
});

test('career level comes from experience; quiz evidence lifts entry to junior only', () => {
  assert.equal(userCareerLevel(user(), NOW).level, 'junior');
  assert.equal(userCareerLevel(user({ experience: [] }), NOW).level, 'entry');
  const twoStrong = user({
    experience: [],
    skills: [
      { name: 'Excel', selfLevel: 'expert', assessedLevel: 'expert' },
      { name: 'SQL', selfLevel: 'mid', assessedLevel: 'advanced' },
    ],
  });
  assert.equal(userCareerLevel(twoStrong, NOW).level, 'junior');
  const selfOnly = user({
    experience: [],
    skills: [{ name: 'Excel', selfLevel: 'expert', assessedLevel: null }],
  });
  assert.equal(userCareerLevel(selfOnly, NOW).level, 'entry', 'self-rating never raises it');
});

test('required years and the job level are read from the ad', () => {
  assert.equal(requiredYears('At least two (2) years of relevant work experience'), 2);
  assert.equal(requiredYears('Minimum of 5+ years of experience in finance'), 5);
  assert.equal(requiredYears('3-5 years experience required'), 3);
  assert.equal(requiredYears('Experience with Excel'), null);
  assert.equal(jobCareerLevel(job()), 'junior');
  assert.equal(jobCareerLevel(job({ title: 'Senior Data Manager', description: '' })), 'senior');
  assert.equal(
    jobCareerLevel(job({ title: 'Data Officer', description: 'Minimum 10 years of experience.' })),
    'expert',
  );
  assert.equal(jobCareerLevel(job({ title: 'Data Intern', description: '' })), 'entry');
  assert.equal(jobCareerLevel(job({ title: 'Driver', description: 'Drive the car.' })), null);
});

test('skills the job asks for: essential vs desirable; a short name inside a longer one is not counted', () => {
  const skills = jobSkills(job(), ['Microsoft Excel', 'Report writing']);
  const byName = Object.fromEntries(skills.map((s) => [s.name, s.importance]));
  assert.equal(byName['Microsoft Excel'], 'essential');
  assert.equal(byName['Report writing'], 'essential');
  assert.equal(byName.spss, 'desirable');

  const security = jobSkills(
    job({ description: 'Requirements: food security programming experience.' }),
    [],
  ).map((s) => s.name);
  assert.ok(security.includes('food security'));
  assert.equal(security.includes('security'), false);
  assert.equal(
    jobSkills(job({ description: 'Excellent communication.' }), []).some((s) => s.name === 'excel'),
    false,
    'whole words only',
  );
});

test('End Test: a fitting job is recommended, with every explanation field', () => {
  const m = matchJob(user(), job(), ctx);
  assert.equal(m.recommended, true);
  assert.ok(['strong', 'good'].includes(m.category), m.category);
  assert.deepEqual(m.matchedSkills.sort(), ['Microsoft Excel', 'Report writing']);
  assert.deepEqual(m.missingRequired, []);
  assert.deepEqual(m.missingPreferred, ['spss']);
  assert.equal(m.levelFit, 'fits');
  assert.ok(m.score > 0 && m.score <= 100);
  const keys = m.reasons.map((r) => r.key);
  for (const k of [
    'skillsMatched',
    'skillsAssessed',
    'level_fits',
    'inRegion',
    'inCity',
    'titleWanted',
  ]) {
    assert.ok(keys.includes(k), k);
  }
});

test('End Test: a junior is never sent a senior job as recommended, however good the skills', () => {
  const senior = job({
    title: 'Senior Programme Manager',
    description: 'Requirements: minimum 8 years of experience. Excel and report writing.',
  });
  const m = matchJob(user(), senior, ctx);
  assert.equal(m.levelFit, 'above');
  assert.equal(m.recommended, false);
  assert.ok(m.reasons.some((r) => r.key === 'notRecommendedLevel'));
});

test('missing essential skills keep a job out of the main results, and are listed', () => {
  const analyst = job({
    title: 'Data Analyst',
    description: 'Requirements: SQL, Python and Power BI are required. Excel.',
  });
  const m = matchJob(user(), analyst, ctx);
  assert.deepEqual(m.missingRequired.sort(), ['power bi', 'python', 'sql']);
  assert.equal(m.recommended, false);
  assert.ok(m.reasons.some((r) => r.key === 'notRecommendedSkills'));
});

test('End Test: assessed skills weigh more than self-reported ones', () => {
  const assessed = matchJob(user(), job(), ctx).score;
  const selfOnly = matchJob(
    user({
      skills: [
        { name: 'Microsoft Excel', selfLevel: 'advanced', assessedLevel: null },
        { name: 'Report writing', selfLevel: 'mid', assessedLevel: null },
      ],
    }),
    job(),
    ctx,
  ).score;
  assert.ok(assessed > selfOnly, `${assessed} > ${selfOnly}`);
});

test('known fixtures land in the expected category', () => {
  // Strong: fits, every skill, place and title.
  assert.equal(
    matchJob(
      user(),
      job({ description: 'Requirements: Excel and report writing. 2 years of experience.' }),
      ctx,
    ).category,
    'strong',
  );
  // Gap: other field, other region, skills missing.
  const nurse = job({
    title: 'Nurse',
    description: 'Requirements: nursing and midwifery. 3 years of experience.',
    region: 'somalia',
    city: 'Mogadishu',
    employerType: 'health',
  });
  assert.equal(matchJob(user(), nurse, ctx).category, 'gap');
  // A job that names no checkable skill is judged on title and place, and says so.
  const vague = matchJob(user(), job({ description: 'Join our great team!' }), ctx);
  assert.ok(vague.reasons.some((r) => r.key === 'skillsNotStated'));
});
