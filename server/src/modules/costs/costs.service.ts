import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type SQL, sql } from 'drizzle-orm';

import { TenantDb } from '../../database/tenant-db.service';
import { baseCurrency } from '../stock/rates';
import {
  correctCost,
  type CorrectedCost,
  type CostInput,
} from '../stock/revaluation';
import type { ListNeedsCostDto } from './dto/list-needs-cost.dto';

/**
 * Needs-cost rows still standing (ADR-048).
 *
 * The flag is never edited; a row is cleared by a later one. A correction
 * that references it clears any acquisition, and a run_close for its run
 * clears a batch's output. Everything that marks a figure provisional reads
 * through this, so there is one definition of "still waiting".
 */
function openNeedsCost(organizationId: string): SQL {
  return sql`
    select v.id, v.variant_id, v.lot_id, v.created_at
    from stock_valuations v
    left join stock_movements m on m.id = v.movement_id
    where v.organization_id = ${organizationId}::uuid
      and v.needs_cost
      and not exists (
        select 1
        from stock_valuations c
        where c.organization_id = v.organization_id
          and c.kind = 'correction'
          and c.reference_type = 'stock_valuation'
          and c.reference_id = v.id
      )
      and (
        coalesce(m.reason, '') <> 'production'
        or not exists (
          select 1
          from stock_valuations r
          where r.organization_id = v.organization_id
            and r.kind = 'run_close'
            and r.reference_type = 'production_order'
            and r.reference_id = m.reference_id
        )
      )
  `;
}

type Row = Record<string, unknown>;

/**
 * What stock, lots and batches cost (ADR-048). Reads only, apart from the
 * one correction route, which is delegated to the stock module because it
 * writes the valuation ledger and that ledger has one home.
 *
 * Every query is raw SQL with each table aliased and the organization named
 * by hand, as the stock service's multi-join reads are.
 */
@Injectable()
export class CostsService {
  private readonly logger = new Logger(CostsService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  async setCost(
    valuationId: string,
    input: CostInput,
    actorId: string,
  ): Promise<CorrectedCost> {
    const corrected = await this.tenantDb.transaction((tx, organizationId) =>
      correctCost(tx, organizationId, valuationId, input, actorId),
    );

    this.logger.log(`Valuation ${valuationId} costed at ${corrected.value}`);

    return corrected;
  }

  /** Everything on hand, pool by pool, and what it is worth together. */
  stockValuation() {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const base = await baseCurrency(tx, organizationId);

      const pools = await tx.execute(sql`
        with open as (${openNeedsCost(organizationId)})
        select p.variant_id, pv.sku, p.lot_id, l.code as lot_code,
               p.quantity, p.value,
               round(p.value / p.quantity, 6) as unit_cost,
               exists (
                 select 1 from open o
                 where o.variant_id = p.variant_id
                   and o.lot_id is not distinct from p.lot_id
               ) as provisional
        from valuation_pools p
        join product_variants pv on pv.id = p.variant_id
        left join lots l on l.id = p.lot_id
        where p.organization_id = ${organizationId}::uuid
          and p.quantity > 0
        order by pv.sku, l.code nulls first
      `);

      const totals = await tx.execute(sql`
        select coalesce(sum(p.value), 0) as total
        from valuation_pools p
        where p.organization_id = ${organizationId}::uuid
          and p.quantity > 0
      `);

      const rows = pools.rows as Row[];

      return {
        currency: base,
        total: (totals.rows[0] as { total: string }).total,
        provisional: rows.some((row) => row.provisional === true),
        pools: rows.map((row) => ({
          variantId: row.variant_id,
          sku: row.sku,
          lotId: row.lot_id,
          lotCode: row.lot_code,
          quantity: row.quantity,
          value: row.value,
          unitCost: row.unit_cost,
          provisional: row.provisional,
        })),
      };
    });
  }

  /** One lot: what its pool holds, and the rows that made it so. */
  lotCost(lotId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const found = await tx.execute(sql`
        select l.id, l.code, l.variant_id, pv.sku
        from lots l
        join product_variants pv on pv.id = l.variant_id
        where l.id = ${lotId}::uuid
          and l.organization_id = ${organizationId}::uuid
      `);

      const [lot] = found.rows as Row[];
      if (!lot) throw new NotFoundException('No such lot');

      const base = await baseCurrency(tx, organizationId);

      const pool = await tx.execute(sql`
        with open as (${openNeedsCost(organizationId)})
        select p.quantity, p.value,
               case when p.quantity > 0
                    then round(p.value / p.quantity, 6) end as unit_cost,
               exists (
                 select 1 from open o
                 where o.variant_id = p.variant_id
                   and o.lot_id = p.lot_id
               ) as provisional
        from valuation_pools p
        where p.organization_id = ${organizationId}::uuid
          and p.variant_id = ${lot.variant_id as string}::uuid
          and p.lot_id = ${lotId}::uuid
      `);

      const [balance] = pool.rows as Row[];

      // Newest first and capped: a lot's history is short, and the cap keeps
      // a long-lived one from pulling its whole life into a page.
      const entries = await tx.execute(sql`
        select v.id, v.kind, v.quantity, v.value, v.unit_price, v.currency,
               v.exchange_rate, v.needs_cost, v.reference_type,
               v.reference_id, v.created_at, m.reason
        from stock_valuations v
        left join stock_movements m on m.id = v.movement_id
        where v.organization_id = ${organizationId}::uuid
          and v.variant_id = ${lot.variant_id as string}::uuid
          and v.lot_id = ${lotId}::uuid
        order by v.id desc
        limit 100
      `);

      return {
        currency: base,
        lotId,
        lotCode: lot.code,
        sku: lot.sku,
        quantity: balance?.quantity ?? '0.0000',
        value: balance?.value ?? '0.000000',
        unitCost: balance?.unit_cost ?? null,
        provisional: balance?.provisional ?? false,
        entries: (entries.rows as Row[]).map((row) => ({
          id: row.id,
          kind: row.kind,
          reason: row.reason,
          quantity: row.quantity,
          value: row.value,
          unitPrice: row.unit_price,
          currency: row.currency,
          exchangeRate: row.exchange_rate,
          needsCost: row.needs_cost,
          referenceType: row.reference_type,
          referenceId: row.reference_id,
          createdAt: row.created_at,
        })),
      };
    });
  }

  /**
   * One run: what it consumed and at what value, what it made, and what a
   * unit of the batch cost. Material cost only — external lines and
   * conversion cost are outside the figure by definition (ADR-048).
   *
   * Nothing is costed until close, because consumption is only written then
   * (ADR-032).
   */
  runCost(runId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const found = await tx.execute(sql`
        select po.id, po.status, po.reference, po.quantity_produced,
               pv.sku
        from production_orders po
        join product_variants pv on pv.id = po.output_variant_id
        where po.id = ${runId}::uuid
          and po.organization_id = ${organizationId}::uuid
      `);

      const [run] = found.rows as Row[];
      if (!run) throw new NotFoundException('No such production order');

      const base = await baseCurrency(tx, organizationId);
      const closed = run.status === 'completed';

      const consumed = await tx.execute(sql`
        select pv.sku, l.code as lot_code,
               sum(m.quantity) as quantity,
               -sum(v.value) as value
        from stock_movements m
        join stock_valuations v on v.movement_id = m.id
        join product_variants pv on pv.id = m.variant_id
        left join lots l on l.id = m.lot_id
        where m.organization_id = ${organizationId}::uuid
          and m.reference_type = 'production_order'
          and m.reference_id = ${runId}::uuid
          and m.reason = 'consumption'
        group by pv.sku, l.code
        order by pv.sku, l.code nulls first
      `);

      const totals = await tx.execute(sql`
        select c.material,
               case when ${run.quantity_produced as string}::numeric > 0
                    then round(
                      c.material / ${run.quantity_produced as string}::numeric,
                      6
                    ) end as unit_cost
        from (
          select coalesce(-sum(v.value), 0) as material
          from stock_movements m
          join stock_valuations v on v.movement_id = m.id
          where m.organization_id = ${organizationId}::uuid
            and m.reference_type = 'production_order'
            and m.reference_id = ${runId}::uuid
            and m.reason = 'consumption'
        ) c
      `);

      const outputs = await tx.execute(sql`
        select l.code as lot_code,
               sum(m.quantity) as quantity,
               (select coalesce(sum(r.value), 0)
                  from stock_valuations r
                 where r.organization_id = ${organizationId}::uuid
                   and r.kind in ('run_close', 'issued')
                   and r.reference_type = 'production_order'
                   and r.reference_id = ${runId}::uuid
                   and r.variant_id = m.variant_id
                   and r.lot_id is not distinct from m.lot_id) as value
        from stock_movements m
        left join lots l on l.id = m.lot_id
        where m.organization_id = ${organizationId}::uuid
          and m.reference_type = 'production_order'
          and m.reference_id = ${runId}::uuid
          and m.reason = 'production'
        group by m.variant_id, m.lot_id, l.code
        order by l.code nulls first
      `);

      /**
       * Provisional when something it consumed was drawn from a pool that
       * was still waiting for a cost at the time — the consumption took an
       * average that was missing part of its value.
       */
      const waiting = await tx.execute(sql`
        with open as (${openNeedsCost(organizationId)})
        select exists (
          select 1
          from open o
          join stock_movements m
            on m.variant_id = o.variant_id
           and m.lot_id is not distinct from o.lot_id
          where m.organization_id = ${organizationId}::uuid
            and m.reference_type = 'production_order'
            and m.reference_id = ${runId}::uuid
            and m.reason = 'consumption'
            and o.created_at <= m.created_at
        ) as provisional
      `);

      const summary = totals.rows[0] as {
        material: string;
        unit_cost: string | null;
      };

      return {
        currency: base,
        runId,
        reference: run.reference,
        sku: run.sku,
        status: run.status,
        closed,
        quantityProduced: run.quantity_produced,
        materialCost: closed ? summary.material : null,
        unitCost: closed ? summary.unit_cost : null,
        provisional:
          closed && (waiting.rows[0] as { provisional: boolean }).provisional,
        consumed: (consumed.rows as Row[]).map((row) => ({
          sku: row.sku,
          lotCode: row.lot_code,
          quantity: row.quantity,
          value: row.value,
        })),
        outputs: (outputs.rows as Row[]).map((row) => ({
          lotCode: row.lot_code,
          quantity: row.quantity,
          value: row.value,
        })),
      };
    });
  }

  /**
   * The to-do list: every row still waiting for a cost, newest first, keyset
   * on the UUIDv7 id as the ledger reads are (ADR-018).
   */
  needsCost(query: ListNeedsCostDto) {
    const limit = query.limit ?? 50;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const rows = await tx.execute(sql`
        with open as (${openNeedsCost(organizationId)})
        select v.id, v.kind, pv.sku, v.variant_id, v.lot_id,
               l.code as lot_code, v.quantity, v.unit_price, v.currency,
               v.created_at, m.reason, m.reference_type, m.reference_id
        from open o
        join stock_valuations v on v.id = o.id
        join product_variants pv on pv.id = v.variant_id
        left join lots l on l.id = v.lot_id
        left join stock_movements m on m.id = v.movement_id
        where ${query.before ? sql`v.id < ${query.before}::uuid` : sql`true`}
        order by v.id desc
        limit ${limit + 1}
      `);

      const entries = (rows.rows as Row[]).slice(0, limit).map((row) => ({
        id: row.id as string,
        kind: row.kind,
        reason: row.reason,
        sku: row.sku,
        variantId: row.variant_id,
        lotId: row.lot_id,
        lotCode: row.lot_code,
        quantity: row.quantity,
        unitPrice: row.unit_price,
        currency: row.currency,
        referenceType: row.reference_type,
        referenceId: row.reference_id,
        createdAt: row.created_at,
      }));

      return {
        entries,
        nextCursor:
          rows.rows.length > limit ? entries[entries.length - 1].id : null,
      };
    });
  }
}
