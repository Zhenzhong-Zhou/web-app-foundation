import { Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { TenantDb } from '../../database/tenant-db.service';
import type { Tx } from './stock.service';

/**
 * How far genealogy is followed. Real recipes are two or three levels deep —
 * an ingredient into a blend into a finished good — so ten is generous, and
 * the limit exists to stop a bad record from looping, not to cut off a real
 * chain.
 */
const MAX_DEPTH = 10;

/** A lot related to the traced one through production. */
export interface RelatedLot {
  lotId: string;
  code: string;
  sku: string;
  /** Steps away from the traced lot: 1 is a direct ingredient or batch. */
  depth: number;
  /** The run that connects this lot to the one before it in the chain. */
  runId: string;
  runReference: string | null;
}

/**
 * The recall question, answered for one lot (ADR-044 — lot trace).
 *
 * Everything here is read from the ledger. A lot's story is its movements:
 * a receipt or a production output says where it came from, a consumption
 * says what it went into, a shipment or a sample says who has it, a return
 * says what came back. Runs are the joints between lots — what a run consumed
 * is upstream of what it produced — and following them in both directions is
 * the whole of genealogy.
 *
 * Nothing is stored for this. There is no genealogy table to keep in step,
 * so there is nothing that can disagree with the movements it would describe.
 */
@Injectable()
export class LotTraceService {
  constructor(private readonly tenantDb: TenantDb) {}

  async trace(lotId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const lot = await this.header(tx, organizationId, lotId);

      // One after another: a transaction is one connection, and queries on
      // it run in turn whatever the code says, so Promise.all would only
      // pretend to be parallel.
      const balances = await this.balances(tx, organizationId, lotId);
      const sources = await this.sources(tx, organizationId, lotId);
      const madeFrom = await this.related(tx, organizationId, lotId, 'up');
      const wentInto = await this.related(tx, organizationId, lotId, 'down');

      /**
       * Recipients of this lot and of everything made from it. A customer who
       * received a finished batch made from a bad ingredient is exactly who a
       * recall has to reach, though the ingredient's own movements never
       * mention them.
       */
      const recipients = await this.recipients(tx, organizationId, [
        lotId,
        ...wentInto.map((related) => related.lotId),
      ]);

      return { lot, balances, sources, madeFrom, wentInto, recipients };
    });
  }

  /**
   * Lots whose code starts with what was typed, across every product. A
   * recall usually arrives as a code read off a label, with no product
   * attached, and the same code can exist for two products — so every match
   * is returned with its SKU rather than guessing.
   *
   * Prefix rather than anywhere-in: "FOC-26" should find "FOC-2609-01", and
   * a match in the middle of a code is almost always noise. % and _ are
   * escaped so they match themselves.
   */
  async search(code: string) {
    const pattern = `${code.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const rows = (
        await tx.execute(sql`
          select l.id, l.code, l.expires_at, pv.sku
          from lots l
          join product_variants pv on pv.id = l.variant_id
          where l.organization_id = ${organizationId}::uuid
            and l.code ilike ${pattern}
          order by l.code, pv.sku
          limit 20
        `)
      ).rows as {
        id: string;
        code: string;
        expires_at: Date | null;
        sku: string;
      }[];

      return rows.map((row) => ({
        id: row.id,
        code: row.code,
        expiresAt: row.expires_at,
        sku: row.sku,
      }));
    });
  }

  private async header(tx: Tx, organizationId: string, lotId: string) {
    const [row] = (
      await tx.execute(sql`
        select
          l.id,
          l.code,
          l.expires_at,
          pv.sku,
          pv.unit_of_measure,
          pr.name as product_name,
          pv.name as variant_name
        from lots l
        join product_variants pv on pv.id = l.variant_id
        join products pr on pr.id = pv.product_id
        where l.organization_id = ${organizationId}::uuid
          and l.id = ${lotId}::uuid
      `)
    ).rows as {
      id: string;
      code: string;
      expires_at: Date | null;
      sku: string;
      unit_of_measure: string;
      product_name: string;
      variant_name: string | null;
    }[];

    // Scoped by organization, so another tenant's lot is simply not found.
    if (!row) throw new NotFoundException('No such lot');

    return {
      id: row.id,
      code: row.code,
      expiresAt: row.expires_at,
      sku: row.sku,
      unitOfMeasure: row.unit_of_measure,
      description: row.variant_name
        ? `${row.product_name} (${row.variant_name})`
        : row.product_name,
    };
  }

  /** Where it is now, including bins marked unavailable (ADR-042). */
  private async balances(tx: Tx, organizationId: string, lotId: string) {
    const rows = (
      await tx.execute(sql`
        select
          sl.location_id,
          loc.name as location_name,
          loc.is_available,
          sl.quantity::text as quantity
        from stock_levels sl
        join locations loc on loc.id = sl.location_id
        where sl.organization_id = ${organizationId}::uuid
          and sl.lot_id = ${lotId}::uuid
          and sl.quantity <> 0
        order by loc.name
      `)
    ).rows as {
      location_id: string;
      location_name: string;
      is_available: boolean;
      quantity: string;
    }[];

    return rows.map((row) => ({
      locationId: row.location_id,
      locationName: row.location_name,
      isAvailable: row.is_available,
      quantity: row.quantity,
    }));
  }

  /**
   * How the lot came into existence: received from a supplier, or made in a
   * run. A receipt entered by hand has no order, and says so rather than
   * being left out — a gap in the trail is itself worth knowing.
   */
  private async sources(tx: Tx, organizationId: string, lotId: string) {
    const rows = (
      await tx.execute(sql`
        select
          sm.reason,
          min(sm.created_at) as first_at,
          sum(sm.quantity)::text as quantity,
          o.id as order_id,
          o.reference as order_reference,
          p.name as partner_name,
          po.id as run_id,
          po.reference as run_reference,
          po.licence_number,
          po.licence_authority
        from stock_movements sm
        left join orders o
          on sm.reference_type = 'purchase_order' and o.id = sm.reference_id
        left join partners p on p.id = o.partner_id
        left join production_orders po
          on sm.reference_type = 'production_order' and po.id = sm.reference_id
        where sm.organization_id = ${organizationId}::uuid
          and sm.lot_id = ${lotId}::uuid
          and sm.reason in ('receipt', 'production')
        group by sm.reason, o.id, o.reference, p.name, po.id, po.reference,
          po.licence_number, po.licence_authority
        order by first_at
      `)
    ).rows as {
      reason: 'receipt' | 'production';
      first_at: Date;
      quantity: string;
      order_id: string | null;
      order_reference: string | null;
      partner_name: string | null;
      run_id: string | null;
      run_reference: string | null;
      licence_number: string | null;
      licence_authority: string | null;
    }[];

    return rows.map((row) => ({
      kind: row.reason,
      at: row.first_at,
      quantity: row.quantity,
      orderId: row.order_id,
      orderReference: row.order_reference,
      supplierName: row.partner_name,
      runId: row.run_id,
      runReference: row.run_reference,
      licenceNumber: row.licence_number,
      licenceAuthority: row.licence_authority,
    }));
  }

  /**
   * Lots connected through production, followed as far as they go.
   *
   * Up: the runs that produced this lot, then what those runs consumed, then
   * the runs that produced those, and so on. Down: the runs that consumed
   * this lot, then what they produced, and on. Each step starts from the lots
   * already found and reaches the next through two indexes — by lot, then by
   * reference — so the work grows with the size of the trace, not the ledger.
   *
   * UNION rather than UNION ALL: a lot issued in several transfers appears in
   * several movements of one run, and without deduplication each would
   * multiply the rows of every step after it. The path array refuses a lot
   * already on its own chain, so a bad record cannot loop.
   */
  private async related(
    tx: Tx,
    organizationId: string,
    lotId: string,
    direction: 'up' | 'down',
  ): Promise<RelatedLot[]> {
    // Down: this lot is consumed, and the run's output is the next lot.
    // Up: this lot is produced, and the run's consumption is the next lot.
    const [near, far] =
      direction === 'down'
        ? (['consumption', 'production'] as const)
        : (['production', 'consumption'] as const);

    const rows = (
      await tx.execute(sql`
        with recursive chain(lot_id, depth, path, run_id) as (
          select ${lotId}::uuid, 0, array[${lotId}::uuid], null::uuid
          union
          select next.lot_id, chain.depth + 1, chain.path || next.lot_id, here.reference_id
          from chain
          join stock_movements here
            on here.organization_id = ${organizationId}::uuid
           and here.lot_id = chain.lot_id
           and here.reference_type = 'production_order'
           and here.reason = ${near}
          join stock_movements next
            on next.organization_id = ${organizationId}::uuid
           and next.reference_type = 'production_order'
           and next.reference_id = here.reference_id
           and next.reason = ${far}
           and next.lot_id is not null
          where chain.depth < ${MAX_DEPTH}
            and not next.lot_id = any(chain.path)
        )
        select distinct on (chain.lot_id)
          chain.lot_id,
          chain.depth,
          chain.run_id,
          l.code,
          pv.sku,
          po.reference as run_reference
        from chain
        join lots l on l.id = chain.lot_id
        join product_variants pv on pv.id = l.variant_id
        left join production_orders po on po.id = chain.run_id
        where chain.depth > 0
        order by chain.lot_id, chain.depth
      `)
    ).rows as {
      lot_id: string;
      depth: number;
      run_id: string;
      code: string;
      sku: string;
      run_reference: string | null;
    }[];

    return rows
      .map((row) => ({
        lotId: row.lot_id,
        code: row.code,
        sku: row.sku,
        depth: Number(row.depth),
        runId: row.run_id,
        runReference: row.run_reference,
      }))
      .sort((a, b) => a.depth - b.depth || a.code.localeCompare(b.code));
  }

  /**
   * Everyone who received any of these lots, and what came back.
   *
   * A shipment reaches its customer through its order; a sample through the
   * recipient it was checked against (ADR-042); a return through its order. A
   * shipment or sample with no recipient on record is kept, with the partner
   * left empty: a recall has to know how much went somewhere it cannot name.
   */
  private async recipients(tx: Tx, organizationId: string, lotIds: string[]) {
    const ids = sql.join(
      lotIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    );

    const rows = (
      await tx.execute(sql`
        select
          p.id as partner_id,
          p.name as partner_name,
          o.id as order_id,
          o.reference as order_reference,
          o.is_sample,
          l.id as lot_id,
          l.code as lot_code,
          sm.sku,
          coalesce(sum(sm.quantity) filter (where sm.reason = 'shipment'), 0)::text as shipped,
          coalesce(sum(sm.quantity) filter (where sm.reason = 'sample'), 0)::text as sampled,
          coalesce(sum(sm.quantity) filter (where sm.reason = 'return'), 0)::text as returned
        from stock_movements sm
        join lots l on l.id = sm.lot_id
        left join shipments s
          on sm.reference_type = 'shipment' and s.id = sm.reference_id
        left join order_returns r
          on sm.reference_type = 'order_return' and r.id = sm.reference_id
        left join orders o on o.id = coalesce(s.order_id, r.order_id)
        left join partners p on p.id = coalesce(
          o.partner_id,
          case when sm.reference_type = 'partner' then sm.reference_id end
        )
        where sm.organization_id = ${organizationId}::uuid
          and sm.lot_id in (${ids})
          and sm.reason in ('shipment', 'sample', 'return')
        group by p.id, p.name, o.id, o.reference, o.is_sample, l.id, l.code, sm.sku
        order by p.name nulls last, o.reference nulls last, l.code
      `)
    ).rows as {
      partner_id: string | null;
      partner_name: string | null;
      order_id: string | null;
      order_reference: string | null;
      is_sample: boolean | null;
      lot_id: string;
      lot_code: string;
      sku: string;
      shipped: string;
      sampled: string;
      returned: string;
    }[];

    return rows.map((row) => ({
      partnerId: row.partner_id,
      partnerName: row.partner_name,
      orderId: row.order_id,
      orderReference: row.order_reference,
      isSampleOrder: row.is_sample ?? false,
      lotId: row.lot_id,
      lotCode: row.lot_code,
      sku: row.sku,
      shipped: row.shipped,
      sampled: row.sampled,
      returned: row.returned,
    }));
  }
}
