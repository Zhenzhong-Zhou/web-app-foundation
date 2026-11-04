import type { OrderDirection } from '../lib/api-names';

/**
 * New order filled in from Reorder points (ADR-085): Raise a purchase
 * order passes it as router state, a line per chosen item at its
 * suggestion, each quantity as the server writes it. The supplier is left
 * to choose, and nothing is saved until the person raises the order. A new
 * tab or a bookmark carries no state, so New order opens empty, as before.
 */
export interface OrderFill {
  lines: { variantId: string; quantity: string }[];
}

/**
 * The state Raise a purchase order navigates with: its lines, and the
 * direction it knows, a purchase, so New order does not ask (#454).
 */
export function fillState(fill: OrderFill): {
  fill: OrderFill;
  direction: OrderDirection;
} {
  return { fill, direction: 'purchase' };
}

/**
 * The direction the link that opened New order passed, or null: Home,
 * Getting started, the first week and Orders pass none, and the form asks
 * Selling or Buying, since a partner may be either (#454).
 */
export function directionOf(state: unknown): OrderDirection | null {
  if (typeof state !== 'object' || state === null || !('direction' in state)) {
    return null;
  }
  const { direction } = state as { direction: unknown };
  return direction === 'purchase' || direction === 'sale' ? direction : null;
}

/** The fill the link that opened New order passed, or null. */
export function orderFillOf(state: unknown): OrderFill | null {
  if (typeof state !== 'object' || state === null || !('fill' in state)) {
    return null;
  }
  const { fill } = state as { fill: unknown };
  if (typeof fill !== 'object' || fill === null || !('lines' in fill)) {
    return null;
  }
  const { lines } = fill as { lines: unknown };
  if (!Array.isArray(lines)) return null;

  const read = lines.filter(
    (line): line is OrderFill['lines'][number] =>
      typeof line === 'object' &&
      line !== null &&
      typeof (line as { variantId?: unknown }).variantId === 'string' &&
      typeof (line as { quantity?: unknown }).quantity === 'string',
  );
  return read.length ? { lines: read } : null;
}
