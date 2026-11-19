/**
 * SYNTHETIC test profiles (TIQ-9). Every name, employer, school, phone number
 * and date is made up; none is a real person. Used by the mock tests and the
 * live check: real users' data is never sent to the free AI tier.
 */
export interface SampleProfile {
  id: string;
  personal: Record<string, string>;
  experience: Record<string, unknown>[];
  education: Record<string, unknown>[];
  projects: Record<string, unknown>[];
  certifications: Record<string, unknown>[];
  languages: Record<string, unknown>[];
  skills: { name: string; selfLevel: string; category?: string; yearsExp?: number }[];
}

export const HEALTH_PROFILE: SampleProfile = {
  id: 'health-officer',
  personal: {
    fullName: 'Ayaan Testcase',
    headline: 'Community Health Worker',
    profession: 'Public health',
    region: 'somaliland',
    city: 'Hargeisa',
    phone: '+252 63 000 0001',
    summary: 'Community health worker with field experience in vaccination campaigns.',
  },
  experience: [
    {
      title: 'Community Health Worker',
      employer: 'Example Water and Health Agency',
      city: 'Hargeisa',
      startDate: '2022-03',
      description:
        'Visited 40 households a week; recorded vaccination data in Excel; trained 6 new volunteers; wrote monthly field reports.',
    },
    {
      title: 'Data Entry Volunteer',
      employer: 'Sample Youth Centre',
      startDate: '2020-01',
      endDate: '2021-12',
      description: 'Entered survey forms into spreadsheets.',
    },
  ],
  education: [
    {
      school: 'Example Institute of Health Sciences',
      degree: 'Diploma',
      field: 'Public Health',
      startYear: 2018,
      endYear: 2021,
    },
  ],
  projects: [
    {
      name: 'Vaccination tracker sheet',
      description: 'Built an Excel sheet that tracks vaccination visits per village.',
      skills: ['Microsoft Excel'],
    },
  ],
  certifications: [
    {
      name: 'First Aid Certificate',
      issuer: 'Example Red Crescent Training Unit',
      issuedOn: '2022-06',
    },
  ],
  languages: [
    { language: 'Somali', level: 'native' },
    { language: 'English', level: 'fluent' },
  ],
  skills: [
    { name: 'Microsoft Excel', selfLevel: 'mid', category: 'Tools', yearsExp: 3 },
    { name: 'Report writing', selfLevel: 'advanced', category: 'Communication' },
    { name: 'Community mobilisation', selfLevel: 'advanced', category: 'Public health' },
  ],
};

export const DEVELOPER_PROFILE: SampleProfile = {
  id: 'developer',
  personal: {
    fullName: 'Liban Fakename',
    headline: 'Junior Web Developer',
    region: 'somalia',
    city: 'Mogadishu',
  },
  experience: [
    {
      title: 'Web Development Intern',
      employer: 'Sample Digital Studio',
      startDate: '2024-06',
      endDate: '2024-12',
      description:
        'Built React components for 2 client websites and fixed bugs reported by testers.',
    },
  ],
  education: [
    {
      school: 'Example University of Technology',
      degree: 'BSc',
      field: 'Computer Science',
      startYear: 2020,
      endYear: 2024,
    },
  ],
  projects: [
    {
      name: 'Market prices app',
      description: 'A JavaScript web app that lists daily market prices.',
      skills: ['JavaScript', 'React'],
    },
  ],
  certifications: [],
  languages: [{ language: 'Somali', level: 'native' }],
  skills: [
    { name: 'JavaScript', selfLevel: 'mid', category: 'Frontend' },
    { name: 'React', selfLevel: 'mid', category: 'Frontend' },
    { name: 'Git', selfLevel: 'beginner', category: 'Tools' },
  ],
};

/** Extracted job facts (as TIQ-8 returns them) for the synthetic ads. */
export const HEALTH_JOB = {
  language: 'en' as const,
  title: 'Public Health Officer',
  company: 'Example Health Partnership',
  location: 'Hargeisa, Somaliland',
  jobType: 'full_time' as const,
  requiredSkills: ['Report writing', 'Microsoft Excel', 'SQL'],
  preferredSkills: ['DHIS2'],
  education: ["Bachelor's degree in Public Health"],
  experience: ['3 years of experience in community health'],
  responsibilities: ['Coordinate community health workers', 'Write monthly reports'],
  qualifications: [],
  deadline: '2026-12-15',
  keywords: ['public health', 'vaccination'],
};

export const DEVELOPER_JOB = {
  language: 'en' as const,
  title: 'Junior Software Developer',
  company: 'Sample Tech Hub',
  location: 'Mogadishu, Somalia',
  jobType: 'full_time' as const,
  requiredSkills: ['JavaScript', 'React', 'Git'],
  preferredSkills: ['Node.js', 'MongoDB', 'TypeScript'],
  education: ['Diploma or degree in Computer Science'],
  experience: ['At least 1 year of experience building websites'],
  responsibilities: ['Build web applications', 'Fix bugs', 'Write tests'],
  qualifications: [],
  deadline: null,
  keywords: ['React', 'web'],
};
