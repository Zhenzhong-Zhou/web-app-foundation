import { and, asc, eq, sql } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { returnAuthorizationLines } from '../../database/schema';

/**
 * Per line: authorized, received against this RMA, and credited against
 * it. Received sums the `return` movements of returns naming this RMA, for
 * the line's variant — an order has one line per variant (ADR-027).
 * Summed in SQL and returned as numeric text (ADR-025).
 */
export async function linesWithProgress(
  tx: Transaction,
  organizationId: string,
  returnAuthorizationId: string,
) {
  return tx
    .select({
      id: returnAuthorizationLines.id,
      orderLineId: returnAuthorizationLines.orderLineId,
      variantId: returnAuthorizationLines.variantId,
      sku: returnAuthorizationLines.sku,
      quantity: returnAuthorizationLines.quantity,
      resolution: returnAuthorizationLines.resolution,
      /**
       * The outer row is named in plain SQL, not through Drizzle: in a
       * query with no joins Drizzle writes a column without its table, and
       * inside a subquery a bare "id" or "variant_id" binds to the
       * subquery's own tables instead of this row.
       */
      quantityReceived: sql<string>`coalesce((
        select sum(sm.quantity)
        from stock_movements sm
        join order_returns r on r.id = sm.reference_id
        where sm.organization_id = ${organizationId}::uuid
          and sm.reason = 'return'
          and sm.reference_type = 'order_return'
          and r.return_authorization_id = return_authorization_lines.return_authorization_id
          and sm.variant_id = return_authorization_lines.variant_id
      ), 0)::numeric(18, 4)::text`,
      quantityCredited: sql<string>`coalesce((
        select sum(cnl.quantity)
        from credit_note_lines cnl
        where cnl.organization_id = ${organizationId}::uuid
          and cnl.return_authorization_line_id = return_authorization_lines.id
      ), 0)::numeric(18, 4)::text`,
    })
    .from(returnAuthorizationLines)
    .where(
      and(
        eq(returnAuthorizationLines.organizationId, organizationId),
        eq(
          returnAuthorizationLines.returnAuthorizationId,
          returnAuthorizationId,
        ),
      ),
    )
    .orderBy(asc(returnAuthorizationLines.sku));
}
