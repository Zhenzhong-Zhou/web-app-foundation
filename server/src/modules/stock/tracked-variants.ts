import { and, eq, inArray } from 'drizzle-orm';

import { productVariants } from '../../database/schema';
import type { Tx } from './stock.service';

/**
 * Which of these variants move by lot. Shared by everything that issues or
 * ships several items at once — shipments, returns, production — so the
 * question has one answer.
 */
export async function trackedVariants(
  tx: Tx,
  organizationId: string,
  variantIds: string[],
): Promise<Set<string>> {
  if (variantIds.length === 0) return new Set();

  const rows = await tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        inArray(productVariants.id, variantIds),
        eq(productVariants.tracksLots, true),
      ),
    );

  return new Set(rows.map((row) => row.id));
}
