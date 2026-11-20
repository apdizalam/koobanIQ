/** The user's report (TIQ-20), as GET /reports returns it (backend services/reportService.ts). */

export const REPORT_PERIODS = ['hour', 'day', 'week', 'month', 'year'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** Numbers for one period: direct counts of stored records (averages are null when there is nothing). */
export interface PeriodCounts {
  start: string;
  end: string;
  quizzes: { finished: number; averageScorePercent: number | null };
  interviews: { finished: number; answers: number; averageScore: number | null };
  cvs: { created: number; approved: number; exported: number };
  jobs: {
    jobAdsSaved: number;
    searches: number;
    jobsFound: number;
    saved: number;
    scored: number;
    recommended: number;
  };
}

export interface Report {
  period: ReportPeriod;
  timeZone: string;
  generatedAt: string;
  current: PeriodCounts;
  previous: PeriodCounts;
}
