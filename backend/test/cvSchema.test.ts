import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCvAnswerSchema } from '../src/ai/schemas/cv.js';
import { profileText, type CvAiInput } from '../src/services/cvFacts.js';

// Ids are random database ids; these two contain digit runs ("10", "2030") on purpose.
const EXPERIENCE_ID = '6765a10fbc2030de4f5a6b7c';
const LANGUAGE_ID = '6765b99ccc2030de4f5a6b7d';

const input: CvAiInput = {
  target: {
    title: 'Data Officer',
    requiredSkills: [],
    preferredSkills: [],
    responsibilities: [],
    qualifications: [],
    education: [],
    experience: [],
    keywords: [],
  },
  profile: {
    headline: 'Data clerk',
    profession: null,
    summary: null,
    experience: [
      {
        id: EXPERIENCE_ID,
        title: 'Data clerk',
        startDate: '2022-03',
        endDate: null,
        description: 'Entered survey forms.',
      },
    ],
    education: [],
    projects: [],
    certifications: [],
    languages: [{ id: LANGUAGE_ID, language: 'Somali', level: 'native' }],
    skills: [{ name: 'Excel', selfLevel: 'mid', assessedLevel: null, yearsExp: 3 }],
  },
};

const answer = (summary: string) => ({
  headline: 'Data clerk',
  summary,
  skills: ['Excel'],
  experience: [{ id: EXPERIENCE_ID, bullets: ['Entered survey forms.'] }],
  education: [],
  projects: [],
  certifications: [],
  languages: [{ id: LANGUAGE_ID }],
});

test('profileText leaves out entry ids (random digits are not facts)', () => {
  const text = profileText(input);
  assert.equal(text.includes(EXPERIENCE_ID), false);
  assert.equal(text.includes(LANGUAGE_ID), false);
  assert.ok(text.includes('2022-03'), 'real facts stay');
});

test('a number found only inside an id is still refused; real profile numbers pass', () => {
  const schema = buildCvAnswerSchema(input);
  assert.equal(schema.safeParse(answer('Data clerk with 10 years of experience.')).success, false);
  assert.equal(schema.safeParse(answer('Working since 2030.')).success, false);
  assert.equal(
    schema.safeParse(answer('Data clerk since 2022 with 3 years of Excel.')).success,
    true,
  );
});
