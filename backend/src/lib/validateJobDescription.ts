import { AppError } from './errors.js';

// Field messages are keys under server.validation in the shared translation files.

export const JD_TEXT_MIN = 50;
export const JD_TEXT_MAX = 20_000;
export const PDF_MAX_BYTES = 5 * 1024 * 1024;

export type JobDescriptionInput =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; fileName: string | null; data: string; bytes: Buffer };

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const fail = (details: Record<string, string>) => {
  if (Object.keys(details).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', details);
  }
};

/**
 * Body of POST /job-descriptions: either `{ text }` (50–20,000 characters) or
 * `{ pdf: { data, fileName? } }` with a base64 PDF of at most 5 MB. Not both.
 */
export function parseJobDescriptionInput(body: unknown): JobDescriptionInput {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const details: Record<string, string> = {};
  for (const key of Object.keys(b)) {
    if (key !== 'text' && key !== 'pdf') details[key] = 'fieldNotEditable';
  }
  const hasText = b.text !== undefined;
  const hasPdf = b.pdf !== undefined;
  if (hasText === hasPdf) {
    details.body = 'jdTextOrPdf';
    fail(details);
  }

  if (hasText) {
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    if (text.length < JD_TEXT_MIN || text.length > JD_TEXT_MAX) details.text = 'jdTextLength';
    fail(details);
    return { kind: 'text', text };
  }

  const pdf = (b.pdf && typeof b.pdf === 'object' ? b.pdf : {}) as Record<string, unknown>;
  const data = typeof pdf.data === 'string' ? pdf.data.replace(/\s+/g, '') : '';
  let bytes = Buffer.alloc(0);
  if (!data || !BASE64_RE.test(data)) {
    details.pdf = 'pdfInvalid';
  } else {
    bytes = Buffer.from(data, 'base64');
    if (bytes.length > PDF_MAX_BYTES) details.pdf = 'pdfTooLarge';
    // A real PDF starts with "%PDF-".
    else if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') details.pdf = 'pdfInvalid';
  }
  let fileName: string | null = null;
  if (pdf.fileName !== undefined) {
    if (typeof pdf.fileName !== 'string' || pdf.fileName.trim().length > 200) {
      details.fileName = 'textTooLong';
    } else {
      fileName = pdf.fileName.trim() || null;
    }
  }
  fail(details);
  return { kind: 'pdf', fileName, data, bytes };
}
