import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gt, lt, or, type SQL, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import { searchTerms } from '../../common/search';
import {
  locations,
  lots,
  products,
  productVariants,
  stockLevels,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { openNeedsCost } from '../costs/open-needs-cost';
import { itemMatches } from '../products/item-search';
import type { ListMovementsDto } from './dto/list-movements.dto';
import type { MovementPage, StockVariant } from './dto/stock-response.dto';
import { namesIn } from './item-name';
import { lotMatches } from './lot-search';
import { movementPage, type MovementSight } from './movement-view';

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

  // The item (SKU, names in every language, pinyin) or the lot's code or
  // supplier's lot, matched as every search in the app matches (ADR-056,
  // common/search.ts; ADR-094, R6).
  if (query.search) {
    const terms = searchTerms(query.search);
    scope.push(
      or(itemMatches(terms, organizationId), lotMatches(lots, terms))!,
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
     * (CostsService.everyPool). As an EXISTS per stock row it read every
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
   * The ledger, read: a page of the one movement row (movement-view.ts),
   * each part for a reader who may see it, with its stock card's figures.
   */
  listMovements(
    query: ListMovementsDto,
    locale: Locale | null,
    sight: MovementSight,
  ): Promise<MovementPage> {
    return this.tenantDb.transaction((tx, organizationId) =>
      movementPage(tx, organizationId, query, locale, sight),
    );
  }

  /**
   * One code by its id, named in the reader's language (ADR-093, 133b):
   * in use only while it and its item are, as the pickers list it. Its
   * organization on the code and on its item's join, so another's id is
   * not found.
   */
  variant(id: string, locale: Locale): Promise<StockVariant> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const shown = namesIn(locale, organizationId);
      const [row] = await tx
        .select({
          id: productVariants.id,
          sku: productVariants.sku,
          productName: shown.productName,
          variantName: shown.variantName,
          unitOfMeasure: productVariants.unitOfMeasure,
          isActive: sql<boolean>`${productVariants.isActive} and ${products.isActive}`,
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
            eq(productVariants.id, id),
          ),
        );
      if (!row) {
        throw new NotFoundException(
          t({ id: 'stock.suchItem', defaultMessage: 'No such item' }),
        );
      }
      return row;
    });
  }
}
