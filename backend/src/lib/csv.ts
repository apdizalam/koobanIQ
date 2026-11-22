/**
 * CSV for admin exports (TIQ-33). One header row, comma separated, CRLF line
 * ends, UTF-8 with a byte-order mark so spreadsheet apps read Somali letters
 * right. Values with a comma, quote or line break are quoted. A text that a
 * spreadsheet would run as a formula (starts with = + - @ tab or CR) gets a
 * leading apostrophe, so an exported job title or email can never execute.
 */
export type CsvValue = string | number | boolean | Date | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
/** Byte-order mark: tells spreadsheet apps the file is UTF-8. */
const BOM = String.fromCharCode(0xfeff);

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'boolean'
        ? value
          ? 'yes'
          : 'no'
        : String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
