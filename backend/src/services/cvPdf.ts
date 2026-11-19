import PDFDocument from 'pdfkit';
import { translate } from '../lib/i18n.js';
import type { AssembledCv } from './cvFacts.js';

const NAVY = '#1F3A5F';
const TEXT = '#111827';
const MUTED = '#4B5563';

/**
 * The CV as a PDF (TIQ-10), built from the saved CV each time it is downloaded
 * (owner decision: nothing is stored). Same order and wording as the app's CV
 * preview; headings, "present" and level names in the CV's language, from the
 * same shared translation files the app uses. Uses the standard Helvetica font
 * (covers English and Somali in the Latin alphabet).
 */
export function buildCvPdf(content: AssembledCv, options: { compress?: boolean } = {}) {
  const lang = content.language;
  const t = (key: string) => translate(lang, key) ?? key;
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 50, bottom: 50, left: 56, right: 56 },
    compress: options.compress ?? true,
    info: { Title: `CV ${content.header.fullName ?? ''}`.trim(), Producer: 'KOBANIQ' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const h = content.header;
  const place = [h.city, h.region ? t(`common.region.${h.region}`) : null]
    .filter(Boolean)
    .join(', ');

  if (h.fullName) doc.font('Helvetica-Bold').fontSize(20).fillColor(TEXT).text(h.fullName);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT).text(h.headline);
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor(MUTED)
    .text([place, h.email, h.phone].filter(Boolean).join(' · '));

  const heading = (key: string) => {
    doc.moveDown(1);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(NAVY)
      .text(t(`mobile.cv.preview.${key}`).toUpperCase(), { characterSpacing: 0.6 });
    doc.moveDown(0.3);
  };
  const body = (text: string) => doc.font('Helvetica').fontSize(10).fillColor(TEXT).text(text);
  const strong = (text: string) =>
    doc.font('Helvetica-Bold').fontSize(10).fillColor(TEXT).text(text);
  const muted = (text: string) => doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(text);
  const bullet = (text: string) =>
    doc.font('Helvetica').fontSize(10).fillColor(TEXT).text(`• ${text}`, { indent: 8 });
  const years = (a: number | null, b: number | null) => (a || b ? `${a ?? ''}–${b ?? ''}` : null);

  heading('summary');
  body(content.summary);

  if (content.experience.length > 0) {
    heading('experience');
    for (const e of content.experience) {
      strong(`${e.title} · ${e.employer}`);
      muted(
        [e.city, `${e.startDate} – ${e.endDate ?? t('mobile.cv.preview.present')}`]
          .filter(Boolean)
          .join(' · '),
      );
      e.bullets.forEach(bullet);
      doc.moveDown(0.4);
    }
  }

  if (content.education.length > 0) {
    heading('education');
    for (const e of content.education) {
      strong(e.school);
      const line = [e.degree, e.field, years(e.startYear, e.endYear)].filter(Boolean).join(' · ');
      if (line) muted(line);
      doc.moveDown(0.3);
    }
  }

  if (content.skills.length > 0) {
    heading('skills');
    body(
      content.skills
        .map(
          (s) =>
            `${s.name} (${t(`mobile.skills.levels.${s.level}`)}${s.assessed ? `, ${t('mobile.cv.preview.assessed')}` : ''})`,
        )
        .join(' · '),
    );
  }

  if (content.projects.length > 0) {
    heading('projects');
    for (const p of content.projects) {
      strong(p.name);
      if (p.url) muted(p.url);
      p.bullets.forEach(bullet);
      doc.moveDown(0.3);
    }
  }

  if (content.certifications.length > 0) {
    heading('certifications');
    for (const c of content.certifications) {
      body([c.name, c.issuer, c.issuedOn].filter(Boolean).join(' · '));
    }
  }

  if (content.languages.length > 0) {
    heading('languages');
    body(
      content.languages
        .map((l) => `${l.language} (${t(`mobile.profile.levels.${l.level}`)})`)
        .join(' · '),
    );
  }

  doc.end();
  return done;
}

/** A safe download name, e.g. "CV-Amina-Testcase-so-v2.pdf". */
export function cvFileName(content: AssembledCv, version: number) {
  const name = (content.header.fullName ?? 'KOBANIQ')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return `CV-${name || 'KOBANIQ'}-${content.language}-v${version}.pdf`;
}
