import { NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import { orderLines } from '../../database/schema';
import type { Tx } from '../stock/stock.service';

export type OrderLine = typeof orderLines.$inferSelect;

/*
 * Lookups shared by the documents that act on several lines at once —
 * shipments and returns. One copy, so a fix to how a missing line is
 * reported cannot land in one and miss the other.
 */

/**
 * The named lines of one order, all or nothing. Scoped by organization and
 * order together, so a line id from another order is not found rather than
 * acted on through the wrong URL.
 */
export async function requestedLines(
  tx: Tx,
  organizationId: string,
  orderId: string,
  lineIds: string[],
): Promise<OrderLine[]> {
  const lines = await tx
    .select()
    .from(orderLines)
    .where(
      and(
        eq(orderLines.organizationId, organizationId),
        eq(orderLines.orderId, orderId),
        inArray(orderLines.id, lineIds),
      ),
    );

  const found = new Set(lines.map((line) => line.id));
  const missing = lineIds.find((id) => !found.has(id));

  if (missing) throw new NotFoundException(`No line ${missing} on this order`);

  return lines;
}

/** One line from a set already loaded by requestedLines. */
export function lineFor(lines: OrderLine[], lineId: string): OrderLine {
  const line = lines.find((row) => row.id === lineId);
  if (!line) throw new NotFoundException(`No line ${lineId} on this order`);
  return line;
}
