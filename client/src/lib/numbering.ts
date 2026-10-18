import type { CalendarDay, NumberingReset } from './api-names';
import { calendarDay } from './date-range';

/**
 * How a number is written (ADR-073), as the server writes it
 * (server/src/modules/numbering/numbering-format.ts): checked here first so
 * the Numbering section can say what is wrong as it is typed, and print the
 * next number as it will be taken. The server checks again on save.
 */

type Token = 'YYYY' | 'YY' | 'MM' | 'DD';

const TOKEN_WIDTH: Record<Token, number> = { YYYY: 4, YY: 2, MM: 2, DD: 2 };

/** The most a prefix prints, and with its digits (Italy and France take 20). */
const MAX_PRINTED_PREFIX = 16;
const MAX_PRINTED_NUMBER = 20;

type Piece = { text: string } | { token: Token };

export type PrefixProblem =
  | 'characters'
  | 'start'
  | 'end'
  | 'doubleSlash'
  | 'repeated'
  | 'tooLong'
  | 'tooLongWithDigits'
  | 'resetNeedsDate';

function piecesOf(prefix: string): Piece[] | null {
  const pieces: Piece[] = [];
  let rest = prefix;
  while (rest.length > 0) {
    const match = /^\{(YYYY|YY|MM|DD)\}/.exec(rest);
    if (match) {
      pieces.push({ token: match[1] as Token });
      rest = rest.slice(match[0].length);
      continue;
    }
    const brace = rest.search(/[{}]/);
    if (brace === 0) return null;
    const text = brace === -1 ? rest : rest.slice(0, brace);
    pieces.push({ text });
    rest = rest.slice(text.length);
  }
  return pieces;
}

const tokensOf = (pieces: Piece[]): Token[] =>
  pieces.flatMap((piece) => ('token' in piece ? [piece.token] : []));

function printedLength(prefix: string): number {
  return (piecesOf(prefix) ?? []).reduce(
    (sum, piece) =>
      sum + ('token' in piece ? TOKEN_WIDTH[piece.token] : piece.text.length),
    0,
  );
}

/** The first thing wrong with a series, or null: the server's rules. */
export function prefixProblem(
  prefix: string,
  digits: number,
  reset: NumberingReset,
): PrefixProblem | null {
  const pieces = piecesOf(prefix);
  if (!pieces) return 'characters';

  const texts = pieces.flatMap((piece) =>
    'text' in piece ? [piece.text] : [],
  );
  if (texts.some((text) => !/^[A-Z0-9_/-]*$/.test(text))) return 'characters';

  const tokens = tokensOf(pieces);
  if (new Set(tokens).size !== tokens.length) return 'repeated';
  if (tokens.includes('YYYY') && tokens.includes('YY')) return 'repeated';

  if (pieces.length > 0) {
    const first = pieces[0];
    if ('text' in first && !/^[A-Z0-9]/.test(first.text)) return 'start';
    const last = pieces[pieces.length - 1];
    if ('token' in last || /[0-9]$/.test(last.text)) return 'end';
  }

  if (texts.some((text) => text.includes('//'))) return 'doubleSlash';

  const length = printedLength(prefix);
  if (length > MAX_PRINTED_PREFIX) return 'tooLong';
  if (length + digits > MAX_PRINTED_NUMBER) return 'tooLongWithDigits';

  const year = tokens.includes('YYYY') || tokens.includes('YY');
  const needs: Record<NumberingReset, boolean> = {
    never: true,
    yearly: year,
    monthly: year && tokens.includes('MM'),
    daily: year && tokens.includes('MM') && tokens.includes('DD'),
  };
  if (!needs[reset]) return 'resetNeedsDate';

  return null;
}

/** A prefix as printed on a day. */
export function render(prefix: string, day: CalendarDay): string {
  const parts: Record<Token, string> = {
    YYYY: day.slice(0, 4),
    YY: day.slice(2, 4),
    MM: day.slice(5, 7),
    DD: day.slice(8, 10),
  };
  return (piecesOf(prefix) ?? [])
    .map((piece) => ('token' in piece ? parts[piece.token] : piece.text))
    .join('');
}

/** A whole number as printed: the prefix on its day, then the counter. */
export function formatNumber(
  prefix: string,
  digits: number,
  value: number,
  day: CalendarDay,
): string {
  return `${render(prefix, day)}${String(value).padStart(digits, '0')}`;
}

/** Which counter a day belongs to: '', 2026, 2026-10 or 2026-10-17. */
export function periodKey(reset: NumberingReset, day: CalendarDay): string {
  switch (reset) {
    case 'yearly':
      return day.slice(0, 4);
    case 'monthly':
      return day.slice(0, 7);
    case 'daily':
      return day.slice(0, 10);
    default:
      return '';
  }
}

/** The first day of the period after today's, or null with no reset. */
export function nextPeriodStart(
  reset: NumberingReset,
  today: CalendarDay,
): CalendarDay | null {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const date = Number(today.slice(8, 10));
  switch (reset) {
    case 'yearly':
      return calendarDay(year + 1, 0, 1);
    case 'monthly':
      return calendarDay(year, month, 1);
    case 'daily':
      return calendarDay(year, month - 1, date + 1);
    default:
      return null;
  }
}

/** Whether two prefixes could print the same text on some day. */
export function couldPrintSame(a: string, b: string): boolean {
  const slots = (prefix: string): string[] =>
    (piecesOf(prefix) ?? []).flatMap((piece) =>
      'token' in piece
        ? Array<string>(TOKEN_WIDTH[piece.token]).fill('#')
        : [...piece.text],
    );
  const left = slots(a);
  const right = slots(b);
  if (left.length !== right.length) return false;
  return left.every((char, index) => {
    const other = right[index];
    if (char === '#' || other === '#') {
      return (
        (char === '#' || /[0-9]/.test(char)) &&
        (other === '#' || /[0-9]/.test(other))
      );
    }
    return char === other;
  });
}

/** A ready-made format: the series' own letters, then the rest. */
export interface NumberingFormat {
  prefix: string;
  digits: number;
  reset: NumberingReset;
}

/**
 * The three common formats (ADR-073, as approved on the canvas), each
 * keeping the series' letters so two series never share one: INV-000001,
 * INV-2026-0001 each year, INV20261017-001 each day.
 */
export function commonFormats(letters: string): NumberingFormat[] {
  return [
    { prefix: `${letters}-`, digits: 6, reset: 'never' },
    { prefix: `${letters}-{YYYY}-`, digits: 4, reset: 'yearly' },
    { prefix: `${letters}{YYYY}{MM}{DD}-`, digits: 3, reset: 'daily' },
  ];
}

/** A prefix's leading letters, or the fallback when it starts otherwise. */
export function lettersOf(prefix: string, fallback: string): string {
  return /^[A-Z]+/.exec(prefix)?.[0] ?? fallback;
}

/** The date tokens, as the buttons insert them. */
export const DATE_TOKENS = ['{YYYY}', '{YY}', '{MM}', '{DD}'] as const;
