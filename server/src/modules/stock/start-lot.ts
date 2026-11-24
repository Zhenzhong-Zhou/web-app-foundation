import { and, eq, inArray } from 'drizzle-orm';

import { type LotNote, lots } from '../../database/schema';
import type { Tx } from './stock.service';

/** The note the lot that took a code's stock as its tracking started has. */
export const TRACKING_STARTED: LotNote = 'tracking_started';

/**
 * Each code's start lot, by its variant: the lot that took the code's stock
 * on hand as its lot tracking started, found by its note's key (ADR-094,
 * Q4a). A code that started with nothing on hand has none until stock from
 * before comes back (StockService.recordWithin's `fromBefore`), and none
 * is listed for it.
 */
export async function startLotsOf(
  tx: Tx,
  organizationId: string,
  variantIds: string[],
): Promise<Map<string, { id: string; code: string }>> {
  if (variantIds.length === 0) return new Map();

  const rows = await tx
    .select({ variantId: lots.variantId, id: lots.id, code: lots.code })
    .from(lots)
    .where(
      and(
        eq(lots.organizationId, organizationId),
        inArray(lots.variantId, variantIds),
        eq(lots.note, TRACKING_STARTED),
      ),
    );

  return new Map(rows.map((row) => [row.variantId, row]));
}
