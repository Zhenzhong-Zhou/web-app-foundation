import type { ReorderPointRow } from '../api/types.gen';
import { toScaled } from '../lib/decimal';

/**
 * Zero or less, as the server writes a quantity: "-12.0000", "0.0000".
 * Read on the text, never parsed into a JavaScript number (ADR-025).
 */
export function atOrBelowZero(quantity: string): boolean {
  return quantity.startsWith('-') || /^0+(\.0+)?$/.test(quantity);
}

/**
 * How much of a row's bar the position fills, as a whole percent (ADR-085):
 * the bar's scale is twice the point, so the point's mark sits in the
 * middle. Zero or less fills nothing, past twice the point fills it all.
 * Worked out on scaled integers, so no quantity passes through a double;
 * only the percent drawn is a number.
 */
export function barFill(position: string, point: string): number {
  if (atOrBelowZero(position)) return 0;
  const have = toScaled(position);
  const scale = toScaled(point);
  if (have === null || scale === null || scale === 0n) return 0;

  const percent = (have * 100n) / (2n * scale);
  return Number(percent > 100n ? 100n : percent);
}

/**
 * Whether a row can be chosen for a purchase order (ADR-085): a bought
 * item that is low with something to suggest is `open`; one whose drafts
 * leave nothing to suggest is `drafted`, its box shown but disabled so
 * nobody orders it twice; everything else, made, enough or discontinued,
 * has no box.
 */
export type Choice = 'none' | 'open' | 'drafted';

export function choiceOf(
  row: Pick<ReorderPointRow, 'source' | 'status' | 'drafted' | 'suggestion'>,
): Choice {
  if (row.source !== 'bought') return 'none';
  if (row.status !== 'low' && row.status !== 'out') return 'none';
  if (row.drafted) return 'drafted';
  return atOrBelowZero(row.suggestion) ? 'none' : 'open';
}
