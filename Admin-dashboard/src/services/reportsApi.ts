import type { AuthState } from '../auth/authContext';

type Request = AuthState['request'];

/** Backend services/adminExportService.ts (TIQ-33). */
export const EXPORT_KINDS = ['users', 'usage', 'runs', 'jobs', 'cvs', 'quizzes'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export const EXPORT_PERIODS = ['day', 'week', 'month', 'year', 'all'] as const;
export type ExportPeriod = (typeof EXPORT_PERIODS)[number];
export const isExportPeriod = (v: unknown): v is ExportPeriod =>
  typeof v === 'string' && (EXPORT_PERIODS as readonly string[]).includes(v);

export interface CsvExport {
  filename: string;
  rows: number;
  /** True when only the newest 10,000 rows are in the file. */
  truncated: boolean;
  csv: string;
}

export const fetchExport = (request: Request, kind: ExportKind, period: ExportPeriod) =>
  request<CsvExport>(`/admin/reports/${kind}?period=${period}`);

/** Saves the CSV as a file in the browser (no new tab, nothing kept in memory). */
export function saveCsv(file: Pick<CsvExport, 'filename' | 'csv'>, doc: Document = document) {
  const url = URL.createObjectURL(new Blob([file.csv], { type: 'text/csv;charset=utf-8' }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = file.filename;
  doc.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
