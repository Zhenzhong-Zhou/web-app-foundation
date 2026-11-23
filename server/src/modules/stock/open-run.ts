import { type SQL, sql } from 'drizzle-orm';

import { TRACKING_STARTED } from './start-lot';

/**
 * The run still open that a pile was issued to (review 73): a released run
 * at the pile's place, with a transfer of the pile's lot into it; for the
 * start lot, a transfer of the code with no lot too, released before its
 * tracking started (ADR-094, Q2a). Its close takes from the lots it was
 * issued there (allocateFefo's `fromRunId`), so moving that lot into
 * another would leave the close short: Move to another lot is refused while
 * the run is open, and the pile says why. Open runs are few, so the read
 * starts from them. One row, `id`, `reference` and `quantity_planned`, or
 * none.
 */
export function openRunIssued(
  organizationId: string,
  pile: { variantId: SQL; locationId: SQL; lotId: SQL; lotNote: SQL },
): SQL {
  return sql`
    select po.id, po.reference, po.quantity_planned::text as quantity_planned
    from production_orders po
    join stock_movements sm
      on sm.organization_id = po.organization_id
     and sm.reference_type = 'production_order'
     and sm.reference_id = po.id
     and sm.reason = 'transfer'
     and sm.to_location_id = po.location_id
    where po.organization_id = ${organizationId}::uuid
      and po.status = 'released'
      and po.location_id = ${pile.locationId}
      and sm.variant_id = ${pile.variantId}
      and (
        sm.lot_id = ${pile.lotId}
        or (sm.lot_id is null and ${pile.lotNote} = ${TRACKING_STARTED})
      )
    order by po.id
    limit 1
  `;
}
