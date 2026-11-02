import type { ReorderPointRow } from '../api/types.gen';
import { toScaled } from '../lib/decimal';
import { formatQuantity } from '../lib/format';

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

/**
 * Whether a row offers Plan a run (ADR-085): a made item, low or out, with
 * something to suggest. A drafted one says Drafted with its run instead,
 * so nobody plans it twice.
 */
export function plansRun(
  row: Pick<ReorderPointRow, 'source' | 'status' | 'drafted' | 'suggestion'>,
): boolean {
  return (
    row.source === 'made' &&
    (row.status === 'low' || row.status === 'out') &&
    !row.drafted &&
    !atOrBelowZero(row.suggestion)
  );
}

/**
 * Whether what a reorder point's field sends is a number above zero with
 * at most four places (ADR-085), as the server's own check refuses
 * otherwise. Read on the text, never parsed (ADR-025), so the dialog says
 * so at the field and asks no preview until it holds; the server still
 * decides on save.
 */
export function aboveZero(decimal: string): boolean {
  return /^\d+(\.\d{1,4})?$/.test(decimal) && !atOrBelowZero(decimal);
}

/**
 * Whether a decimal has more places than the four a quantity keeps
 * (ADR-025), which the dialog refuses in words of their own, since the
 * number may well be above zero.
 */
export function pastFourPlaces(decimal: string): boolean {
  return /\.\d{5,}$/.test(decimal);
}

/**
 * A kept quantity as a field shows it: "2000.0000" is "2000", "12.5000"
 * "12.5", in the language's decimals, so Edit opens with what was typed.
 */
export function fieldQuantity(quantity: string): string {
  return formatQuantity(
    quantity.includes('.') ? quantity.replace(/\.?0+$/, '') : quantity,
  );
}
