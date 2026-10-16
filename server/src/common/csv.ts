/**
 * CSV for spreadsheets (ADR-057): what every export writes.
 *
 * - UTF-8 with a byte-order mark, so Excel reads Chinese and French as
 *   written rather than as mojibake. Numbers, Google Sheets and LibreOffice
 *   ignore the mark.
 * - RFC 4180: comma-separated, CRLF between rows, a field quoted when it
 *   holds a comma, a quote, a line break or space at either end, quotes
 *   inside doubled.
 * - Values as data: callers pass decimals as their database strings
 *   ("1234.5000"), days as YYYY-MM-DD and instants through csvMoment, so a
 *   spreadsheet reads a number as a number and a time as a time, in any
 *   locale.
 * - Formula injection neutralized (OWASP): a text field beginning with =,
 *   +, -, @, a tab or a carriage return gets a leading apostrophe, so a
 *   partner named =HYPERLINK(...) stays text. A plain number keeps its
 *   minus: "-12.50" is a credit, not a formula.
 */
export type CsvValue = string | number | boolean | null | undefined;

export const BOM = '\uFEFF';
const RISKY_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

/**
 * An instant as a spreadsheet opens it, 2026-10-15 18:54:11, in UTC
 * (ADR-057, amended): ISO 8601's T, Z and fractions keep Excel and Numbers
 * from reading a date. A string is read as the instant it names; one that
 * names none is written as it is.
 */
export function csvMoment(value: Date | string): string {
  const instant = value instanceof Date ? value : new Date(value);
  return Number.isNaN(instant.getTime())
    ? String(value)
    : instant.toISOString().slice(0, 19).replace('T', ' ');
}

/** One field, written and neutralized. */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text =
    typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);

  if (RISKY_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** One row, CRLF at its end: what a file streamed a row at a time writes. */
export function csvRow(fields: CsvValue[]): string {
  return `${fields.map(csvField).join(',')}\r\n`;
}

/** A whole file: the BOM, the header row, then a row per record. */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return `${BOM}${[headers, ...rows].map(csvRow).join('')}`;
}
