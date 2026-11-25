import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, type SQL, sql } from 'drizzle-orm';

import { pageOf } from '../../common/keyset';
import type { Locale } from '../../common/locales';
import { detailOf } from '../../common/movement-reasons';
import { type SearchTerms, searchTerms } from '../../common/search';
import {
  afterKeys,
  cursorOf,
  type KeyPart,
  orderOf,
  readKeys,
} from '../../common/sorted-page';
import type { Transaction } from '../../database/database.module';
import {
  lots,
  products,
  type ProductType,
  productVariants,
  type ValuationKind,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { itemMatches } from '../products/item-search';
import { coverOf } from '../products/product-images';
import { latestFormerCode } from '../stock/former-codes';
import { namesIn, nameSortKey, productNameOrder } from '../stock/item-name';
import { lotMatches } from '../stock/lot-search';
import { baseCurrency } from '../stock/rates';
import {
  correctCost,
  type CorrectedCost,
  type CostInput,
  takesCost,
} from '../stock/revaluation';
import { AT_POOL_AVERAGE } from '../stock/valuation';
import type {
  CostCarried,
  LotCost,
  NeedsCostPage,
  RunCost,
  StockValuationCount,
  StockValuationPage,
  StockValuationTotals,
  ValuationPool,
} from './dto/cost-response.dto';
import type { ListNeedsCostDto } from './dto/list-needs-cost.dto';
import type {
  ListValuationDto,
  ValuationFindDto,
  ValuationSort,
} from './dto/list-valuation.dto';
import { isStockValue, openNeedsCost } from './open-needs-cost';

/*
 * The rows of the raw queries below, as Postgres returns them: numeric and
 * the computed amounts as decimal strings, timestamps as Dates. Typed, so
 * the responses built from them are checked against what the API declares
 * (ADR-068) rather than passing through as unknown.
 */
interface PoolRow {
  variant_id: string;
  sku: string;
  lot_id: string | null;
  lot_code: string | null;
  quantity: string;
  value: string;
  unit_cost: string;
  provisional: boolean;
}

/** A page's pool, with its item named for the reader (#296). */
interface PagePoolRow extends PoolRow {
  id: string;
  lot_former_code: string | null;
  product_id: string;
  product_name: string;
  variant_name: string | null;
  type: ProductType;
  cover_file_id: string | null;
}

/** Every pool at once, as the export writes them (ADR-057). */
interface EveryPool {
  /** Null until the organization has a base currency. */
  currency: string | null;
  pools: {
    variantId: string;
    sku: string;
    lotId: string | null;
    lotCode: string | null;
    quantity: string;
    value: string;
    unitCost: string;
    provisional: boolean;
  }[];
}

/** Fifty pools a page unless asked, as every list. */
const PAGE_SIZE = 50;

interface LotRow {
  id: string;
  code: string;
  variant_id: string;
  sku: string;
}

interface BalanceRow {
  quantity: string;
  value: string;
  unit_cost: string | null;
  provisional: boolean;
}

interface EntryRow {
  id: string;
  kind: ValuationKind;
  quantity: string;
  value: string;
  unit_price: string | null;
  currency: string | null;
  exchange_rate: string | null;
  needs_cost: boolean;
  reference_type: string | null;
  reference_id: string | null;
  other_lot_id: string | null;
  other_lot_code: string | null;
  carried: CostCarried | null;
  created_at: Date;
  reason: string | null;
  to_location_id: string | null;
}

interface RunRow {
  id: string;
  status: RunCost['status'];
  reference: string | null;
  quantity_produced: string;
  sku: string;
}

interface MovedRow {
  sku: string;
  lot_code: string | null;
  quantity: string;
  value: string;
}

interface OutputRow {
  lot_code: string | null;
  quantity: string;
  value: string;
}

interface NeedsCostRow {
  id: string;
  kind: ValuationKind;
  sku: string;
  variant_id: string;
  product_id: string;
  product_name: string;
  variant_name: string | null;
  type: ProductType;
  cover_file_id: string | null;
  lot_id: string | null;
  lot_code: string | null;
  from_lot_id: string | null;
  from_lot_code: string | null;
  quantity: string;
  unit_price: string | null;
  currency: string | null;
  created_at: Date;
  reason: string | null;
  reason_detail: string | null;
  reference_type: string | null;
  reference_id: string | null;
  to_location_id: string | null;
  /** The value row's own, where `reference_type` is its movement's. */
  own_reference_type: string | null;
}

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

  /**
   * Stock value's pools a page at a time (ADR-094's amendment, R6): by
   * the item, as the page opens, or by the value, either way; found by
   * an item as every search matches it (ADR-056) or by a lot's codes
   * (lotMatches). Each pool names its item in the reader's language
   * (#296). Equipment is not stock value (isStockValue; ADR-048, amended
   * by ADR-092). What the pools are worth together is valuationTotals',
   * which no page works out again.
   *
   * Two statements: the page's pools by their keys, paged by
   * sorted-page's keys, the cursor holding them (keyedPools); then the
   * page's columns for those alone, its names, cover and Provisional
   * worked out for fifty rather than for every pool (review 44).
   */
  valuation(
    query: ListValuationDto,
    locale: Locale | null,
  ): Promise<StockValuationPage> {
    const limit = query.limit ?? PAGE_SIZE;
    const sort = query.sort ?? 'item';
    const terms = query.search ? searchTerms(query.search) : null;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const parts = valuationKeys(sort);
      const order = ['valuation', sort, locale ?? 'base'].join(' ');
      // A cursor made for another sort or language, or not made here, is
      // refused before anything is read.
      const after = query.cursor
        ? afterKeys(parts, readKeys(query.cursor, order, parts))
        : undefined;
      const found = terms ? poolsFound(terms, organizationId) : undefined;

      const { rows: keyed } = await tx.execute<{
        id: string;
        variant_id: string;
        keys: string[];
      }>(sql`
        with ${keyedPools(sort, locale, organizationId, found)}
        select k.id, k.variant_id,
               array[${sql.join(
                 parts.map((part) => sql`(${part.value})::text`),
                 sql`, `,
               )}] as keys
        from k
        where ${after ?? sql`true`}
        order by ${sql.join(orderOf(parts), sql`, `)}
        limit ${limit + 1}
      `);

      const page = keyed.slice(0, limit);
      const last = page.at(-1);
      return {
        entries: await poolsIn(tx, organizationId, locale, page),
        nextCursor:
          keyed.length > limit && last ? cursorOf(order, last.keys) : null,
      };
    });
  }

  /**
   * What Stock value's pools are worth together, and how many there are
   * (ADR-094's amendment, R6), a read of its own beside the list, as
   * Stock's counts are: every pool of the organization, whatever is
   * found, so the total is never a sum of the rows read. Read as the page
   * opens and again after a cost is set; a find asks valuationCount alone,
   * since the sums, about 180 ms of 213 at ADR-051's large scale, are the
   * same for every find (review 61).
   *
   * Which pools are provisional is worked out once, as a set, and
   * joined, as everyPool does and for its reasons.
   */
  valuationTotals(): Promise<StockValuationTotals> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const base = await baseCurrency(tx, organizationId);

      const {
        rows: [whole],
      } = await tx.execute<{
        total: string;
        pools: number;
        provisional: boolean;
      }>(sql`
        with open as materialized (${openNeedsCost(organizationId)}),
        ${openPools()}
        select coalesce(sum(p.value), 0) as total,
               count(*)::int as pools,
               coalesce(bool_or(op.variant_id is not null), false) as provisional
        from ${poolsFrom(organizationId)}
        ${openPoolOf}
        where ${shownOnHand(organizationId)}
      `);

      return {
        currency: base,
        total: whole.total,
        provisional: whole.provisional,
        pools: whole.pools,
      };
    });
  }

  /**
   * How many of Stock value's pools a find matches (review 61), as the
   * page's own read finds them (poolsFound), a count and nothing else:
   * the totals are the same for every find. No find counts them all.
   */
  valuationCount(query: ValuationFindDto): Promise<StockValuationCount> {
    const terms = query.search ? searchTerms(query.search) : null;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const found = terms ? poolsFound(terms, organizationId) : undefined;
      const {
        rows: [matched],
      } = await tx.execute<{ count: number }>(sql`
        select count(*)::int as count
        from ${poolsFrom(organizationId)}
        where ${and(shownOnHand(organizationId), found)}
      `);
      return { count: matched.count };
    });
  }

  /**
   * Every pool on hand at once, for the export alone (ADR-057), which is
   * the way to read everything together: the page reads them fifty at a
   * time (ADR-094's amendment, R6).
   */
  everyPool(): Promise<EveryPool> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const base = await baseCurrency(tx, organizationId);

      /**
       * Which pools are provisional is worked out once, as a set, and
       * joined. As a subquery per pool it ran once for every pool: half a
       * second at ADR-051's large scale, 23,000 pools. MATERIALIZED keeps
       * Postgres from folding it back into a per-row lookup; the open set is
       * small and read through stock_valuations_org_needs_cost_idx.
       *
       * The nil uuid stands in for "no lot" so the match is a plain
       * equality, which a hash join can use; IS NOT DISTINCT FROM cannot.
       * Every joined table carries the organization, so the join never
       * reads another tenant's variants or lots.
       */
      const pools = await tx.execute(sql`
        with open as materialized (${openNeedsCost(organizationId)}),
        ${openPools()}
        select p.variant_id, ${productVariants.sku} as sku, p.lot_id,
               ${lots.code} as lot_code, p.quantity, p.value,
               round(p.value / p.quantity, 6) as unit_cost,
               (op.variant_id is not null) as provisional
        from ${poolsFrom(organizationId)}
        ${openPoolOf}
        where ${shownOnHand(organizationId)}
        order by ${productVariants.sku}, ${lots.code} nulls first
      `);

      const rows = pools.rows as unknown as PoolRow[];

      return {
        currency: base,
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
  lotCost(lotId: string): Promise<LotCost> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const found = await tx.execute(sql`
        select l.id, l.code, l.variant_id, pv.sku
        from lots l
        join product_variants pv
          on pv.id = l.variant_id
         and pv.organization_id = ${organizationId}::uuid
        where l.id = ${lotId}::uuid
          and l.organization_id = ${organizationId}::uuid
      `);

      const [lot] = found.rows as unknown as LotRow[];
      if (!lot)
        throw new NotFoundException(
          t({ id: 'costs.suchLot', defaultMessage: 'No such lot' }),
        );

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
          and p.variant_id = ${lot.variant_id}::uuid
          and p.lot_id = ${lotId}::uuid
      `);

      const [balance] = pool.rows as unknown as BalanceRow[];

      // Newest first and capped: a lot's history is short, and the cap keeps
      // a long-lived one from pulling its whole life into a page. A lot
      // change's rows name the other lot (ADR-094): where the row out went,
      // where the row in came from. So do the rows of a late cost carried
      // by one, each naming that lot change's row in (D5; spread): in the
      // lot that row is in, the part that came; in any other, the part
      // carried on to it.
      const entries = await tx.execute(sql`
        select v.id, v.kind, v.quantity, v.value, v.unit_price, v.currency,
               v.exchange_rate, v.needs_cost, v.reference_type,
               v.reference_id, v.created_at, m.reason, m.to_location_id,
               ol.id as other_lot_id, ol.code as other_lot_code,
               case
                 when ri.id is null then null
                 when ri.lot_id = v.lot_id then 'from'
                 else 'to'
               end as carried
        from stock_valuations v
        left join stock_movements m
          on m.id = v.movement_id
         and m.organization_id = ${organizationId}::uuid
        left join stock_valuations ri
          on ri.organization_id = ${organizationId}::uuid
         and v.reference_type = 'stock_valuation'
         and ri.id = v.reference_id
         and ri.kind = 'lot_change'
        left join stock_movements rm
          on rm.organization_id = ${organizationId}::uuid
         and rm.id = ri.movement_id
        left join lots ol
          on ol.organization_id = ${organizationId}::uuid
         and ol.id = case
                       when v.kind = 'lot_change' and v.quantity < 0
                         then m.to_lot_id
                       when v.kind = 'lot_change' then m.lot_id
                       when ri.lot_id = v.lot_id then rm.lot_id
                       else ri.lot_id
                     end
        where v.organization_id = ${organizationId}::uuid
          and v.variant_id = ${lot.variant_id}::uuid
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
        entries: (entries.rows as unknown as EntryRow[]).map((row) => ({
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
          otherLotId: row.other_lot_id,
          otherLotCode: row.other_lot_code,
          carried: row.carried,
          atPoolAverage: row.reference_type === AT_POOL_AVERAGE,
          takesCost: takesCost({ ...row, from_lot_code: row.other_lot_code }),
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
  runCost(runId: string): Promise<RunCost> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const found = await tx.execute(sql`
        select po.id, po.status, po.reference, po.quantity_produced,
               pv.sku
        from production_orders po
        join product_variants pv
          on pv.id = po.output_variant_id
         and pv.organization_id = ${organizationId}::uuid
        where po.id = ${runId}::uuid
          and po.organization_id = ${organizationId}::uuid
      `);

      const [run] = found.rows as unknown as RunRow[];
      if (!run)
        throw new NotFoundException(
          t({
            id: 'costs.suchProductionOrder',
            defaultMessage: 'No such production order',
          }),
        );

      const base = await baseCurrency(tx, organizationId);
      const closed = run.status === 'completed';

      const consumed = await tx.execute(sql`
        select pv.sku, l.code as lot_code,
               sum(m.quantity) as quantity,
               -sum(v.value) as value
        from stock_movements m
        join stock_valuations v
          on v.movement_id = m.id
         and v.organization_id = ${organizationId}::uuid
        join product_variants pv
          on pv.id = m.variant_id
         and pv.organization_id = ${organizationId}::uuid
        left join lots l
          on l.id = m.lot_id and l.organization_id = ${organizationId}::uuid
        where m.organization_id = ${organizationId}::uuid
          and m.reference_type = 'production_order'
          and m.reference_id = ${runId}::uuid
          and m.reason = 'consumption'
        group by pv.sku, l.code
        order by pv.sku, l.code nulls first
      `);

      const totals = await tx.execute(sql`
        select c.material,
               case when ${run.quantity_produced}::numeric > 0
                    then round(
                      c.material / ${run.quantity_produced}::numeric,
                      6
                    ) end as unit_cost
        from (
          select coalesce(-sum(v.value), 0) as material
          from stock_movements m
          join stock_valuations v
            on v.movement_id = m.id
           and v.organization_id = ${organizationId}::uuid
          where m.organization_id = ${organizationId}::uuid
            and m.reference_type = 'production_order'
            and m.reference_id = ${runId}::uuid
            and m.reason = 'consumption'
        ) c
      `);

      /**
       * Each output by the lot of its value row, where its cost was
       * posted (postRunCost): output made before the code's lot tracking
       * started has no lot of its own, and its value row has since taken
       * the lot its stock went into (ADR-094, Q2a).
       */
      const outputs = await tx.execute(sql`
        select l.code as lot_code,
               sum(m.quantity) as quantity,
               (select coalesce(sum(r.value), 0)
                  from stock_valuations r
                 where r.organization_id = ${organizationId}::uuid
                   and r.kind in ('run_close', 'issued')
                   and r.reference_type = 'production_order'
                   and r.reference_id = ${runId}::uuid
                   and r.variant_id = v.variant_id
                   and r.lot_id is not distinct from v.lot_id) as value
        from stock_movements m
        join stock_valuations v
          on v.movement_id = m.id
         and v.kind = 'movement'
         and v.organization_id = ${organizationId}::uuid
        left join lots l
          on l.id = v.lot_id and l.organization_id = ${organizationId}::uuid
        where m.organization_id = ${organizationId}::uuid
          and m.reference_type = 'production_order'
          and m.reference_id = ${runId}::uuid
          and m.reason = 'production'
        group by v.variant_id, v.lot_id, l.code
        order by l.code nulls first
      `);

      /**
       * Provisional when something it consumed was drawn from a pool that
       * was still waiting for a cost at the time — the consumption took an
       * average that was missing part of its value. The pool is its value
       * row's, which a component's lot tracking starting since moved into
       * its lot with the pool's rows still waiting (ADR-094).
       */
      const waiting = await tx.execute(sql`
        with open as (${openNeedsCost(organizationId)})
        select exists (
          select 1
          from open o
          join stock_valuations v
            on v.variant_id = o.variant_id
           and v.lot_id is not distinct from o.lot_id
           and v.kind = 'movement'
           and v.organization_id = ${organizationId}::uuid
          join stock_movements m
            on m.id = v.movement_id
           and m.organization_id = ${organizationId}::uuid
          where m.reference_type = 'production_order'
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
        consumed: (consumed.rows as unknown as MovedRow[]).map((row) => ({
          sku: row.sku,
          lotCode: row.lot_code,
          quantity: row.quantity,
          value: row.value,
        })),
        outputs: (outputs.rows as unknown as OutputRow[]).map((row) => ({
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
  needsCost(
    query: ListNeedsCostDto,
    locale: Locale | null,
  ): Promise<NeedsCostPage> {
    const limit = query.limit ?? 50;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      // Each item named in the reader's language, with its page, type and
      // cover, as every list of items draws it (#296).
      const shown = namesIn(locale, organizationId);
      const rows = await tx.execute(sql`
        with open as (${openNeedsCost(organizationId)})
        select v.id, v.kind, ${productVariants.sku} as sku, v.variant_id,
               ${products.id} as product_id,
               ${shown.productName} as product_name,
               ${shown.variantName} as variant_name,
               ${products.type} as type, ${coverOf()} as cover_file_id,
               v.lot_id, l.code as lot_code, fl.id as from_lot_id,
               fl.code as from_lot_code, v.quantity, v.unit_price,
               v.currency, v.created_at, m.reason, m.reason_detail,
               m.reference_type, m.reference_id, m.to_location_id,
               v.reference_type as own_reference_type
        from open o
        join stock_valuations v
          on v.id = o.id and v.organization_id = ${organizationId}::uuid
        join ${productVariants}
          on ${productVariants.id} = v.variant_id
          and ${productVariants.organizationId} = ${organizationId}
        join ${products}
          on ${products.id} = ${productVariants.productId}
          and ${products.organizationId} = ${organizationId}
        left join lots l
          on l.id = v.lot_id and l.organization_id = ${organizationId}::uuid
        left join stock_movements m
          on m.id = v.movement_id
         and m.organization_id = ${organizationId}::uuid
        -- What waits of a lot change is its row in, so the lot it came
        -- from is the one the movement leaves (ADR-094, 3a).
        left join lots fl
          on fl.id = m.lot_id
         and fl.organization_id = ${organizationId}::uuid
         and v.kind = 'lot_change'
        where ${query.before ? sql`v.id < ${query.before}::uuid` : sql`true`}
        order by v.id desc
        limit ${limit + 1}
      `);

      const entries = (rows.rows as unknown as NeedsCostRow[]).map((row) => ({
        id: row.id,
        kind: row.kind,
        reason: row.reason,
        reasonDetail: detailOf(row.reason_detail),
        sku: row.sku,
        variantId: row.variant_id,
        productId: row.product_id,
        productName: row.product_name,
        variantName: row.variant_name,
        type: row.type,
        coverFileId: row.cover_file_id,
        lotId: row.lot_id,
        lotCode: row.lot_code,
        fromLotId: row.from_lot_id,
        fromLotCode: row.from_lot_code,
        quantity: row.quantity,
        unitPrice: row.unit_price,
        currency: row.currency,
        referenceType: row.reference_type,
        referenceId: row.reference_id,
        takesCost: takesCost({
          kind: row.kind,
          reason: row.reason,
          to_location_id: row.to_location_id,
          quantity: row.quantity,
          needs_cost: true,
          reference_type: row.own_reference_type,
          from_lot_code: row.from_lot_code,
        }),
        createdAt: row.created_at,
      }));

      return pageOf(entries, limit);
    });
  }
}

/**
 * "No lot", as open_pools keys a pool: the nil uuid, so the match is a
 * plain equality, which a hash join can use; IS NOT DISTINCT FROM cannot.
 */
const NO_LOT = sql`'00000000-0000-0000-0000-000000000000'::uuid`;

/**
 * The pools still waiting for a cost, from the statement's `open`, as a
 * set to join.
 */
function openPools(): SQL {
  return sql`open_pools as (
    select distinct o.variant_id, coalesce(o.lot_id, ${NO_LOT}) as lot_key
    from open o
  )`;
}

/**
 * Pool `p`'s row in open_pools, `op`, its variant null where none of it
 * waits.
 */
const openPoolOf = sql`left join open_pools op
  on op.variant_id = p.variant_id
 and op.lot_key = coalesce(p.lot_id, ${NO_LOT})`;

/**
 * A pool, `p`, with its variant, its item and its lot, each joined by
 * the organization (ADR-003), unaliased so the item's and the lot's
 * matchers and the name's order read their columns.
 */
function poolsFrom(organizationId: string): SQL {
  const org = sql`${organizationId}::uuid`;
  return sql`valuation_pools p
    join ${productVariants}
      on ${productVariants.id} = p.variant_id
     and ${productVariants.organizationId} = ${org}
    join ${products}
      on ${products.id} = ${productVariants.productId}
     and ${products.organizationId} = ${org}
    left join ${lots}
      on ${lots.id} = p.lot_id
     and ${lots.organizationId} = ${org}`;
}

/**
 * The pools a search finds (ADR-094's amendment, R6): its item's, as
 * every search matches an item (ADR-056), or its lot's, by its code, its
 * supplier's lot or a former code (lotMatches). Each is found once, as an
 * array, through its trigram indexes, and a pool matched by its item's
 * id or its lot's (database.md: an `in` inside an OR is
 * `= any(array(...))`): matched pool by pool, every name and code was
 * read again for each of an item's pools, about 90 ms of the count at
 * ADR-051's large scale.
 */
function poolsFound(terms: SearchTerms, organizationId: string): SQL {
  const org = sql`${organizationId}::uuid`;
  return sql`(
    p.variant_id = any(array(
      select ${productVariants.id}
      from ${productVariants}
      join ${products}
        on ${products.id} = ${productVariants.productId}
       and ${products.organizationId} = ${org}
      where ${productVariants.organizationId} = ${org}
        and ${itemMatches(terms, organizationId)}
    ))
    or p.lot_id = any(array(
      select lt.id from lots lt
      where lt.organization_id = ${org}
        and ${lotMatches(
          {
            id: sql`lt.id`,
            code: sql`lt.code`,
            supplierLot: sql`lt.supplier_lot`,
          },
          terms,
          organizationId,
        )}
    ))
  )`;
}

/**
 * The organization's pools that hold stock and are stock value, for a
 * statement over poolsFrom (isStockValue; ADR-048, amended by ADR-092),
 * read from the item the statement joins: inStockValue's lookup ran once
 * a pool, about 22 ms of each of the page's statements at ADR-051's large
 * scale. The page, its totals and the export read it alike.
 */
function shownOnHand(organizationId: string): SQL {
  return sql`p.organization_id = ${organizationId}::uuid
    and p.quantity > 0
    and ${isStockValue(sql`${products.type}`)}`;
}

/**
 * Stock value's order as key parts over keyedPools' `k` (ADR-094's
 * amendment, R6): by the item, its name as the reader sees it (ADR-056),
 * then its code, then its pool with no lot first and its lots by code, as
 * the export lists them; by the value, either way, the item's order
 * breaking ties. The pool's id last, so every pool has one place.
 */
function valuationKeys(sort: ValuationSort): KeyPart[] {
  const item: KeyPart[] = [
    { value: sql`k.name collate numeric_order`, type: 'text', order: 'asc' },
    { value: sql`k.sku collate numeric_order`, type: 'text', order: 'asc' },
    { value: sql`(k.lot_code is not null)::int`, type: 'int', order: 'asc' },
    { value: sql`coalesce(k.lot_code, '')`, type: 'text', order: 'asc' },
    { value: sql`k.id`, type: 'uuid', order: 'asc' },
  ];

  if (sort === 'item') return item;
  return [
    {
      value: sql`k.value`,
      type: 'numeric',
      order: sort === 'value' ? 'asc' : 'desc',
    },
    ...item,
  ];
}

/**
 * The pools a page is cut from, as `k`: those on hand that the find
 * keeps, each with its keys' columns, valuationKeys'.
 *
 * By the item, its name's sort key is worked out once an item, for every
 * item that is stock value, and joined by its column: written into the
 * page's statement, the translation's subquery and search_text() ran
 * once a pool for the order and twice more for a next page's cursor. At
 * ADR-051's large scale, 14,500 pools of 4,900 items, a next page's keys
 * took 134 ms that way and 58 this, the first page's 68 and 54; and a
 * later page's cursor now passes over the names before it, before a pool
 * is joined. By the value, the name is a part only for a tie, so it
 * stays in the statement, which Postgres flattens: the pools are sorted
 * by their value and the name worked out for the page's rows alone.
 */
function keyedPools(
  sort: ValuationSort,
  locale: Locale | null,
  organizationId: string,
  found: SQL | undefined,
): SQL {
  const name = sql`(${
    locale
      ? productNameOrder(locale, organizationId)
      : nameSortKey(sql`${products.namePinyin}`, sql`${products.name}`)
  })`;
  const columns = sql`p.id, p.variant_id, p.value,
    ${productVariants.sku} as sku, ${lots.code} as lot_code`;
  const where = and(shownOnHand(organizationId), found);

  if (sort !== 'item') {
    return sql`k as (
      select ${columns}, ${name} as name
      from ${poolsFrom(organizationId)}
      where ${where}
    )`;
  }

  return sql`names as materialized (
      select ${products.id} as id, ${name} as name
      from ${products}
      where ${products.organizationId} = ${organizationId}::uuid
        and ${isStockValue(sql`${products.type}`)}
    ),
    k as (
      select ${columns}, n.name
      from ${poolsFrom(organizationId)}
      join names n on n.id = ${products.id}
      where ${where}
    )`;
}

/**
 * A page's pools, in its order: each named for the reader, with its
 * item's page, type and cover (#296), and whether it is provisional,
 * from what waits of the page's items alone (openNeedsCost's
 * `variants`; review 40).
 *
 * Its own statement after the page's keys, under READ COMMITTED: a pool
 * emptied between the two is left out, never divided by (review 81).
 * Exported for that test, which cannot hold one statement while another
 * transaction ships.
 */
export async function poolsIn(
  tx: Transaction,
  organizationId: string,
  locale: Locale | null,
  page: { id: string; variant_id: string }[],
): Promise<ValuationPool[]> {
  if (page.length === 0) return [];

  const shown = namesIn(locale, organizationId);
  const variants = sql`(${sql.join(
    [...new Set(page.map((pool) => pool.variant_id))].map(
      (variantId) => sql`${variantId}::uuid`,
    ),
    sql`, `,
  )})`;
  const ids = sql`(${sql.join(
    page.map((pool) => sql`${pool.id}::uuid`),
    sql`, `,
  )})`;

  const found = await tx.execute(sql`
    with open as materialized (${openNeedsCost(organizationId, variants)}),
    ${openPools()}
    select p.id, p.variant_id, ${productVariants.sku} as sku,
           ${products.id} as product_id,
           ${shown.productName} as product_name,
           ${shown.variantName} as variant_name,
           ${products.type} as type, ${coverOf()} as cover_file_id,
           p.lot_id, ${lots.code} as lot_code,
           ${latestFormerCode(sql`p.lot_id`, organizationId)} as lot_former_code,
           p.quantity, p.value,
           round(p.value / p.quantity, 6) as unit_cost,
           (op.variant_id is not null) as provisional
    from ${poolsFrom(organizationId)}
    ${openPoolOf}
    where p.organization_id = ${organizationId}::uuid
      and p.id in ${ids}
      and p.quantity > 0
  `);

  const rows = found.rows as unknown as PagePoolRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return page.flatMap(({ id }) => {
    const row = byId.get(id);
    if (!row) return [];
    return {
      variantId: row.variant_id,
      sku: row.sku,
      productId: row.product_id,
      productName: row.product_name,
      variantName: row.variant_name,
      type: row.type,
      coverFileId: row.cover_file_id,
      lotId: row.lot_id,
      lotCode: row.lot_code,
      lotFormerCode: row.lot_former_code,
      quantity: row.quantity,
      value: row.value,
      unitCost: row.unit_cost,
      provisional: row.provisional,
    };
  });
}
