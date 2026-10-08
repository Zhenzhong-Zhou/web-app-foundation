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
 *   ("1234.5000"), days as YYYY-MM-DD and instants as ISO 8601, so a
 *   spreadsheet reads a number as a number in any locale.
 * - Formula injection neutralized (OWASP): a text field beginning with =,
 *   +, -, @, a tab or a carriage return gets a leading apostrophe, so a
 *   partner named =HYPERLINK(...) stays text. A plain number keeps its
 *   minus: "-12.50" is a credit, not a formula.
 */
export type CsvValue = string | number | boolean | null | undefined;

const BOM = '\uFEFF';
const RISKY_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;

/** One field, written and neutralized. */
export function csvField(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text =
    typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);

  if (RISKY_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A whole file: the BOM, the header row, then a row per record. */
export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
