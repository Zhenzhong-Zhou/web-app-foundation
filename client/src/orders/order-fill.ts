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

/** The state Raise a purchase order navigates with. */
export function fillState(fill: OrderFill): { fill: OrderFill } {
  return { fill };
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
