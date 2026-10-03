import { sql } from 'drizzle-orm';

import { itemName } from '../stock/item-name';
import type { Tx } from '../stock/stock.service';

/**
 * One SKU and lot within a shipment or a return, as the API returns it.
 *
 * One shape for both, because the client shows both through one table
 * (LotItemsTable) and types a return's items as a shipment's.
 */
export interface LotItem {
  sku: string;
  /** From the catalogue: for the person unpacking, beside the snapshot SKU. */
  description: string;
  unitOfMeasure: string;
  /** Null for untracked stock, which moves without a lot. */
  lotCode: string | null;
  expiresAt: string | null;
  quantity: string;
}

/**
 * Which movements are a document's own: those referencing it, with its reason.
 *
 * The reason keeps other movements referencing the same document out. A
 * void's adjustments reference the shipment they undo (ADR-041), and counting
 * them would double what it carried; a voided shipment still lists what it
 * carried, because that is what was on the slip that was voided.
 */
interface OwnMovements {
  referenceType: 'shipment' | 'order_return';
  reason: 'shipment' | 'return';
}

/**
 * What some documents moved, one item per SKU and lot, keyed by document id.
 * Read from the ledger: the movements are the record, the document row is
 * only the header they hang from. Shared by the shipment list, the packing
 * slip and the return list, so none of them can disagree about what a
 * document moved.
 *
 * A document with no movements has no entry.
 */
export async function lotItemsOf(
  tx: Tx,
  organizationId: string,
  documents: OwnMovements & { ids: string[] },
): Promise<Map<string, LotItem[]>> {
  const rows = (
    await tx.execute(sql`
      select
        sm.reference_id as document_id,
        sm.sku,
        pr.name as product_name,
        pv.name as variant_name,
        pv.unit_of_measure,
        l.code as lot_code,
        l.expires_at,
        sum(sm.quantity)::text as quantity
      from stock_movements sm
      join product_variants pv on pv.id = sm.variant_id
      join products pr on pr.id = pv.product_id
      left join lots l on l.id = sm.lot_id
      where sm.organization_id = ${organizationId}::uuid
        and sm.reference_type = ${documents.referenceType}
        and sm.reason = ${documents.reason}
        and sm.reference_id in (${sql.join(
          documents.ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      group by sm.reference_id, sm.sku, pr.name, pv.name, pv.unit_of_measure,
        l.code, l.expires_at
      order by sm.sku, l.expires_at asc nulls last, l.code
    `)
  ).rows as {
    document_id: string;
    sku: string;
    product_name: string;
    variant_name: string | null;
    unit_of_measure: string;
    lot_code: string | null;
    expires_at: string | null;
    quantity: string;
  }[];

  const byDocument = new Map<string, LotItem[]>();

  for (const row of rows) {
    const items = byDocument.get(row.document_id) ?? [];

    items.push({
      sku: row.sku,
      description: itemName(row.product_name, row.variant_name),
      unitOfMeasure: row.unit_of_measure,
      lotCode: row.lot_code,
      expiresAt: row.expires_at,
      quantity: row.quantity,
    });

    byDocument.set(row.document_id, items);
  }

  return byDocument;
}

/**
 * Headers with what each moved, in the order given: an order's shipments or
 * its returns as their lists show them.
 */
export async function withLotItems<Header extends { id: string }>(
  tx: Tx,
  organizationId: string,
  headers: Header[],
  moved: OwnMovements,
): Promise<(Header & { items: LotItem[] })[]> {
  if (headers.length === 0) return [];

  const items = await lotItemsOf(tx, organizationId, {
    ...moved,
    ids: headers.map((header) => header.id),
  });

  return headers.map((header) => ({
    ...header,
    items: items.get(header.id) ?? [],
  }));
}
