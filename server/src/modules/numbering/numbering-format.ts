import type { DocumentType, NumberingReset } from '../../database/schema';

/**
 * How a number is written (ADR-073): pure functions, shared by taking a
 * number, the settings and their checks, and the lookup.
 *
 * A prefix is text and date tokens. It prints the document's own date in
 * place of each token, then the counter follows, padded to the width.
 */

/** Today's numbers, each organization's numbers until it changes them. */
export const DEFAULT_NUMBERING: Record<
  DocumentType,
  { prefix: string; digits: number; reset: NumberingReset }
> = {
  invoice: { prefix: 'INV-', digits: 6, reset: 'never' },
  credit_note: { prefix: 'CN-', digits: 6, reset: 'never' },
  return_authorization: { prefix: 'RMA-', digits: 6, reset: 'never' },
  sale_order: { prefix: 'SO-', digits: 6, reset: 'never' },
  purchase_order: { prefix: 'PO-', digits: 6, reset: 'never' },
};

/** The most a prefix prints, and with its digits (Italy and France take 20). */
export const MAX_PRINTED_PREFIX = 16;
export const MAX_PRINTED_NUMBER = 20;

type Token = 'YYYY' | 'YY' | 'MM' | 'DD';

const TOKEN_WIDTH: Record<Token, number> = { YYYY: 4, YY: 2, MM: 2, DD: 2 };

type Piece = { text: string } | { token: Token };

/** What is wrong with a prefix, for the refusal to name. */
export type PrefixProblem =
  | 'characters'
  | 'start'
  | 'end'
  | 'doubleSlash'
  | 'repeated'
  | 'tooLong'
  | 'tooLongWithDigits'
  | 'resetNeedsDate';

/**
 * A prefix split into text and tokens, or null when it holds a brace that
 * is not one of the four tokens.
 */
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

/** How many characters a prefix prints: tokens have fixed widths. */
export function printedLength(prefix: string): number {
  return (piecesOf(prefix) ?? []).reduce(
    (sum, piece) =>
      sum + ('token' in piece ? TOKEN_WIDTH[piece.token] : piece.text.length),
    0,
  );
}

/**
 * The first thing wrong with a series' settings, or null when it can be
 * saved. Ending in a non-digit is what lets a number split one way only,
 * prefix then counter, which the refusals rely on.
 */
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

/** A day's parts, from YYYY-MM-DD. */
function partsOf(day: string): Record<Token, string> {
  return {
    YYYY: day.slice(0, 4),
    YY: day.slice(2, 4),
    MM: day.slice(5, 7),
    DD: day.slice(8, 10),
  };
}

/** A prefix as printed on a day: INV-{YYYY}- on 2026-10-17 is INV-2026-. */
export function render(prefix: string, day: string): string {
  const parts = partsOf(day);
  return (piecesOf(prefix) ?? [])
    .map((piece) => ('token' in piece ? parts[piece.token] : piece.text))
    .join('');
}

/** A whole number as printed: the prefix on its day, then the counter. */
export function formatNumber(
  prefix: string,
  digits: number,
  value: number,
  day: string,
): string {
  return `${render(prefix, day)}${String(value).padStart(digits, '0')}`;
}

/** Which counter a day belongs to: '', 2026, 2026-10 or 2026-10-17. */
export function periodKey(reset: NumberingReset, day: string): string {
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

/**
 * A period's first day and the day after its last, YYYY-MM-DD, or null for
 * a series that never starts again. Calendar arithmetic on UTC dates, which
 * have no clock changes to trip over.
 */
export function periodBounds(
  reset: NumberingReset,
  day: string,
): { from: string; before: string } | null {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  const iso = (utc: number) => new Date(utc).toISOString().slice(0, 10);
  switch (reset) {
    case 'yearly':
      return { from: `${year}-01-01`, before: iso(Date.UTC(year + 1, 0, 1)) };
    case 'monthly':
      return {
        from: `${day.slice(0, 7)}-01`,
        before: iso(Date.UTC(year, month, 1)),
      };
    case 'daily':
      return { from: day, before: iso(Date.UTC(year, month - 1, date + 1)) };
    default:
      return null;
  }
}

/**
 * Every number a prefix can print, as a regular expression both Postgres and
 * JavaScript read alike, and how to read one back: the date its tokens show
 * and its counter. Text needs no escaping: a prefix holds only capitals,
 * digits, `-`, `_` and `/`.
 */
export function patternOf(prefix: string): {
  source: string;
  read: (
    number: string,
  ) => { parts: Partial<Record<Token, string>>; value: number } | null;
} {
  const pieces = piecesOf(prefix) ?? [];
  const order = tokensOf(pieces);
  const source = `^${pieces
    .map((piece) =>
      'token' in piece ? `([0-9]{${TOKEN_WIDTH[piece.token]}})` : piece.text,
    )
    .join('')}([0-9]+)$`;
  const regex = new RegExp(source);
  return {
    source,
    read(number) {
      const match = regex.exec(number);
      if (!match) return null;
      const parts: Partial<Record<Token, string>> = {};
      order.forEach((token, index) => {
        parts[token] = match[index + 1];
      });
      return { parts, value: Number(match[order.length + 1]) };
    },
  };
}

/**
 * The period a number read back belongs to, under a reset: the year from
 * {YYYY}, or from {YY} in this century.
 */
export function periodOfParts(
  reset: NumberingReset,
  parts: Partial<Record<Token, string>>,
): string {
  const year = parts.YYYY ?? (parts.YY ? `20${parts.YY}` : '');
  switch (reset) {
    case 'yearly':
      return year;
    case 'monthly':
      return `${year}-${parts.MM ?? ''}`;
    case 'daily':
      return `${year}-${parts.MM ?? ''}-${parts.DD ?? ''}`;
    default:
      return '';
  }
}

/**
 * Whether two prefixes could print the same text on some day: the same
 * length once each token counts as its digits, and at every place the same
 * character or a digit against a token. S{YY}- and S26- can; two empty
 * prefixes do. Since a prefix ends in a non-digit, two numbers are equal
 * only when their prefixes print the same, so this is the whole test.
 */
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

/** A prefix's text before its first token: what the lookup can recognise. */
export function literalStart(prefix: string): string {
  const brace = prefix.indexOf('{');
  return brace === -1 ? prefix : prefix.slice(0, brace);
}

/** A number as a file name: `/` would make a folder (ADR-073). */
export function fileNameOf(number: string): string {
  return number.replaceAll('/', '_');
}
