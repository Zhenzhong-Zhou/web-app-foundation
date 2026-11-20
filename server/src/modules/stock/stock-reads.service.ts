import { Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, lt, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { instantRange } from '../../common/date-range';
import { pageOf } from '../../common/keyset';
import type { Locale } from '../../common/locales';
import { codeMatches, searchTerms } from '../../common/search';
import {
  locations,
  lots,
  products,
  productVariants,
  stockLevels,
  stockMovements,
  users,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { openNeedsCost } from '../costs/open-needs-cost';
import { itemMatches } from '../products/item-search';
import { ListMovementsDto } from './dto/list-movements.dto';
import type { MovementDocument } from './dto/stock-response.dto';
import { namesIn } from './item-name';
import type { Tx } from './stock.service';

/**
 * What stock rows are read by (stockRowsOf): Inventory's filters that a
 * pile answers alone, from the address as `StockFiltersDto` takes them.
 */
export interface StockRowFilters {
  locationId?: string;
  productId?: string;
  /** Emptied rows kept, which are hidden unless asked for. */
  includeEmpty?: string;
  search?: string;
  /** A lot expiring within this many days, the expired among it. */
  expiringWithin?: number;
  expired?: string;
  needsCost?: string;
  /**
   * Those items alone, a parenthesised list of ids: a page's codes, so a
   * row's Waiting for a cost reads their valuations, not the whole
   * organization's (review 40). Never from the address.
   */
  variants?: SQL;
}

/**
 * Expired (ADR-091): a lot whose expiry is before the organization's
 * today. The Lot view's `expired` and Home's late count on Expiring soon,
 * so the late button's count and the rows it opens cannot drift.
 */
export function expiredLot(today: string): SQL {
  return lt(lots.expiresAt, today);
}

/**
 * Stock rows' filters as conditions (ADR-051), shared by the Lot view, its
 * counts and Home, so "Expiring soon 2" counts exactly the rows pressing
 * it shows.
 */
function filtersOf(
  query: StockRowFilters,
  organizationId: string,
  today: string,
): SQL[] {
  /**
   * The organization on every joined table, not only on stock_levels.
   * Redundant for correctness, but without it Postgres joins this
   * tenant's stock to every tenant's lots, variants and products, which
   * is what ADR-051's plan check found: a cost that grows with the whole
   * database rather than with one organization.
   */
  const scope: SQL[] = [
    eq(stockLevels.organizationId, organizationId),
    eq(productVariants.organizationId, organizationId),
    eq(products.organizationId, organizationId),
    eq(locations.organizationId, organizationId),
  ];

  if (query.locationId) {
    scope.push(eq(stockLevels.locationId, query.locationId));
  }

  if (query.productId) {
    scope.push(eq(productVariants.productId, query.productId));
  }

  if (query.variants) {
    scope.push(sql`${stockLevels.variantId} in ${query.variants}`);
  }

  /**
   * Zero rows are kept, not deleted — a shelf that emptied yesterday is a
   * fact worth having, and `LocationsService` depends on the row surviving
   * so an emptied leaf can still gain children. But "what is on this shelf"
   * means what is there, so they are hidden unless asked for.
   */
  if (query.includeEmpty !== 'true') {
    scope.push(gt(stockLevels.quantity, '0'));
  }

  // The item (SKU, names in every language, pinyin) or the lot code, matched
  // as every search in the app matches (ADR-056, common/search.ts).
  if (query.search) {
    const terms = searchTerms(query.search);
    scope.push(
      or(itemMatches(terms, organizationId), codeMatches(lots.code, terms))!,
    );
  }

  const quick = quickFiltersOf(
    organizationId,
    today,
    query.expiringWithin,
    query.variants,
  );
  if (quick.expiring) scope.push(quick.expiring);
  if (query.expired === 'true') scope.push(quick.expired);
  if (query.needsCost === 'true') scope.push(quick.needsCost);

  return scope;
}

/**
 * The quick filters a stock row is read by, as conditions on stockRowsOf's
 * tables: Expiring soon, a lot expiring within `days` of the
 * organization's today, the expired among it (absent without days);
 * Expired; and Waiting for a cost. The list's filters and the Lot view's
 * counts (ADR-093, 30a) read them, so a count is the rows its filter
 * shows.
 */
export function quickFiltersOf(
  organizationId: string,
  today: string,
  days: number | undefined,
  /** Waiting for a cost among those items alone (review 40). */
  variants?: SQL,
): { expiring: SQL | undefined; expired: SQL; needsCost: SQL } {
  return {
    expiring: days
      ? // The organization's today (ADR-072), not the database session's
        // current_date, which depends on how the database is configured.
        sql`${lots.expiresAt} <= ${today}::date + ${days}::int`
      : undefined,
    expired: expiredLot(today),
    /**
     * The same pool as a waiting cost row: its variant, and its lot or none.
     *
     * The waiting pools are worked out once, as a set, as the valuation's are
     * (CostsService.stockValuation). As an EXISTS per stock row it read every
     * row the organization holds to find the few waiting, twice on each Home,
     * for the costs card's count and its rows (#276). MATERIALIZED keeps
     * Postgres from folding the set back into that lookup, and the nil uuid
     * stands in for "no lot" so the match is an equality a hash can use; IS
     * NOT DISTINCT FROM cannot.
     */
    needsCost: sql`(
      ${stockLevels.variantId},
      coalesce(${stockLevels.lotId}, '00000000-0000-0000-0000-000000000000'::uuid)
    ) in (
      with open as materialized (${openNeedsCost(organizationId, variants)})
      select o.variant_id,
             coalesce(o.lot_id, '00000000-0000-0000-0000-000000000000'::uuid)
      from open o
    )`,
  };
}

/**
 * The refusal of an item a list's filter names that is not this
 * organization's: an id from the address, so unknown rather than
 * forbidden, as one in a body is (ADR-003). Without it another
 * organization's item would read as an item with no stock, and the chip
 * naming it would say so.
 */
export const UNKNOWN_ITEM = t({
  id: 'stock.unknownProduct',
  defaultMessage:
    'That item is not in this organization. Remove it from the filter to see every item.',
});

/** A stock row's lot, in the same organization. Left-joined by callers. */
function lotJoin(organizationId: string) {
  return and(
    eq(lots.id, stockLevels.lotId),
    eq(lots.organizationId, organizationId),
  );
}

/**
 * The stock rows these filters match, as the FROM and WHERE of a query:
 * the piles' joins and filtersOf's conditions. The Lot view and its counts
 * read through it (stock-grouped.service.ts), and Home embeds it in its
 * one totals statement (ADR-058), so a count beside a filter, on a card or
 * on the list itself is always of the same rows.
 */
export function stockRowsOf(
  query: StockRowFilters,
  organizationId: string,
  today: string,
): SQL {
  return sql`${stockLevels}
    inner join ${productVariants}
      on ${productVariants.id} = ${stockLevels.variantId}
      and ${productVariants.organizationId} = ${organizationId}::uuid
    inner join ${products}
      on ${products.id} = ${productVariants.productId}
      and ${products.organizationId} = ${organizationId}::uuid
    inner join ${locations}
      on ${locations.id} = ${stockLevels.locationId}
      and ${locations.organizationId} = ${organizationId}::uuid
    left join ${lots} on ${lotJoin(organizationId)}
    where ${and(...filtersOf(query, organizationId, today))}`;
}

/**
 * Reading the ledger that put stock where it is; what is on the shelves
 * now is Inventory's grouped read (stock-grouped.service.ts, ADR-093).
 *
 * Its own service because StockService is the one write path into the
 * ledger (ADR-023), injected by every module that moves stock, while only
 * the stock controller calls this read.
 */
@Injectable()
export class StockReadsService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * The ledger, read. Newest first, keyset cursor on the UUIDv7 id — the same
   * shape as the audit log, for the same reason: the table is append-only, so
   * offset paging would shift every page down as rows arrive at the head.
   *
   * Four left joins, so this drops to a raw handle. Two are
   * the same table aliased, because a transfer names both a source and a
   * destination. Left throughout: a movement with no source is inbound, a lot
   * is null for untracked variants, and an actor may be a tombstone (ADR-012)
   * — an inner join would drop exactly the rows the RESTRICT constraints exist
   * to preserve.
   *
   * The SKU is not joined. It is snapshotted on the row (ADR-023) so a rename
   * does not rewrite history. The item's names beside it are the catalogue's,
   * in the locale given, or the base names for null, as the CSV export reads
   * them (ADR-056): read for the page alone, once it is taken. Joined here,
   * they were worked out for every movement a filter matched before the
   * newest were kept, a scan of every variant for one shelf at ADR-051's
   * large scale. The places, the lot and the actor are joined the same way,
   * to the page's rows once it is taken: one shelf's movements come from the
   * from and the to place's indexes in no order, so joined first, every one
   * of them was joined, each organization's lots read whole, before the
   * newest were kept (ADR-051's watch, ADR-093).
   */
  listMovements(
    query: ListMovementsDto,
    locale: Locale | null,
    /** Who may see each document (55a); none for the export. */
    sight: { orders: boolean; runs: boolean } = { orders: false, runs: false },
  ) {
    const limit = query.limit ?? 50;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const from = alias(locations, 'from_location');
      const to = alias(locations, 'to_location');

      const filters = [
        eq(stockMovements.organizationId, organizationId),
        query.before ? lt(stockMovements.id, query.before) : undefined,
        query.variantId
          ? eq(stockMovements.variantId, query.variantId)
          : undefined,
        query.lotId ? eq(stockMovements.lotId, query.lotId) : undefined,
        query.locationId
          ? or(
              eq(stockMovements.fromLocationId, query.locationId),
              eq(stockMovements.toLocationId, query.locationId),
            )
          : undefined,
        query.reason ? eq(stockMovements.reason, query.reason) : undefined,
        ...instantRange(stockMovements.createdAt, query),
      ].filter((f): f is SQL => f !== undefined);

      // One more than asked for, so the presence of a next page is known
      // without a second count query.
      const movement = tx
        .select({
          id: stockMovements.id,
          variantId: stockMovements.variantId,
          sku: stockMovements.sku,
          quantity: stockMovements.quantity,
          reason: stockMovements.reason,
          reasonDetail: stockMovements.reasonDetail,
          note: stockMovements.note,
          fromLocationId: stockMovements.fromLocationId,
          toLocationId: stockMovements.toLocationId,
          lotId: stockMovements.lotId,
          actorId: stockMovements.actorId,
          createdAt: stockMovements.createdAt,
        })
        .from(stockMovements)
        .where(and(...filters))
        .orderBy(desc(stockMovements.id))
        .limit(limit + 1)
        .as('movement');

      const rows = await tx
        .select({
          id: movement.id,
          variantId: movement.variantId,
          sku: movement.sku,
          quantity: movement.quantity,
          reason: movement.reason,
          reasonDetail: movement.reasonDetail,
          note: movement.note,
          fromLocationName: from.name,
          toLocationName: to.name,
          lotCode: lots.code,
          // Who, by name with their email (ADR-063). An anonymised account
          // keeps its row and its name, Deleted User, and its address is a
          // placeholder, which no one should read as theirs (ADR-012).
          actorName: users.name,
          actorEmail: sql<
            string | null
          >`case when ${users.deletedAt} is null then ${users.email} end`,
          createdAt: movement.createdAt,
        })
        .from(movement)
        .leftJoin(from, eq(from.id, movement.fromLocationId))
        .leftJoin(to, eq(to.id, movement.toLocationId))
        .leftJoin(lots, eq(lots.id, movement.lotId))
        .leftJoin(users, eq(users.id, movement.actorId))
        .orderBy(desc(movement.id));

      const page = pageOf(rows, limit);
      const names = await namesOfItems(
        tx,
        organizationId,
        page.entries.map((row) => row.variantId),
        locale,
      );
      const documents = await documentsOf(
        tx,
        organizationId,
        page.entries.map((row) => row.id),
        sight,
      );

      return {
        ...page,
        entries: page.entries.map(({ variantId, ...movement }) => ({
          ...movement,
          ...names.get(variantId)!,
          document: documents.get(movement.id) ?? null,
        })),
      };
    });
  }
}

/**
 * The document each movement was for, by the movement's id (55a), for the
 * page's alone: a purchase order received on, a sale shipped on (by its
 * shipment) or returned on (by its return), or a run. An order only for
 * a reader with orders.view, a run with production.view. Every join names
 * the organization (ADR-003).
 */
async function documentsOf(
  tx: Tx,
  organizationId: string,
  movementIds: string[],
  sight: { orders: boolean; runs: boolean },
): Promise<Map<string, MovementDocument>> {
  if (movementIds.length === 0 || (!sight.orders && !sight.runs)) {
    return new Map();
  }
  const org = sql`${organizationId}::uuid`;
  const { rows } = await tx.execute<{
    id: string;
    order_id: string | null;
    order_number: string | null;
    run_id: string | null;
    run_reference: string | null;
  }>(sql`
    select m.id,
      coalesce(po.id, so.id, ro.id) as order_id,
      coalesce(po.number, so.number, ro.number) as order_number,
      run.id as run_id,
      run.reference as run_reference
    from stock_movements m
    left join orders po
      on m.reference_type = 'purchase_order'
      and po.id = m.reference_id
      and po.organization_id = ${org}
    left join shipments sh
      on m.reference_type = 'shipment'
      and sh.id = m.reference_id
      and sh.organization_id = ${org}
    left join orders so
      on so.id = sh.order_id
      and so.organization_id = ${org}
    left join order_returns rt
      on m.reference_type = 'order_return'
      and rt.id = m.reference_id
      and rt.organization_id = ${org}
    left join orders ro
      on ro.id = rt.order_id
      and ro.organization_id = ${org}
    left join production_orders run
      on m.reference_type = 'production_order'
      and run.id = m.reference_id
      and run.organization_id = ${org}
    where m.organization_id = ${org}
      and m.id in (${sql.join(
        movementIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
  `);

  const documents = new Map<string, MovementDocument>();
  for (const row of rows) {
    if (sight.orders && row.order_id) {
      documents.set(row.id, {
        kind: 'order',
        id: row.order_id,
        number: row.order_number,
      });
    } else if (sight.runs && row.run_id) {
      documents.set(row.id, {
        kind: 'run',
        id: row.run_id,
        number: row.run_reference,
      });
    }
  }
  return documents;
}

/**
 * Items' names by the item's id, in the locale given or the base names for
 * null (ADR-056), for the few a page shows.
 */
async function namesOfItems(
  tx: Tx,
  organizationId: string,
  variantIds: string[],
  locale: Locale | null,
): Promise<Map<string, { productName: string; variantName: string | null }>> {
  if (variantIds.length === 0) return new Map();

  const shown = namesIn(locale, organizationId);
  const rows = await tx
    .select({
      id: productVariants.id,
      productName: shown.productName,
      variantName: shown.variantName,
    })
    .from(productVariants)
    .innerJoin(
      products,
      and(
        eq(products.id, productVariants.productId),
        eq(products.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        inArray(productVariants.id, [...new Set(variantIds)]),
      ),
    );

  return new Map(rows.map(({ id, ...names }) => [id, names]));
}
