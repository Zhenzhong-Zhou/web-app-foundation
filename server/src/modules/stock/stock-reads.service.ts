import { BadRequestException, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, lt, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { pageOf } from '../../common/keyset';
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
import { ListStockDto } from './dto/list-stock.dto';

/** A page of the stock list unless the caller asks for fewer (ADR-051). */
const STOCK_PAGE_SIZE = 50;

/**
 * Reading stock: what is on the shelves now, and the ledger that put it
 * there.
 *
 * Its own service because StockService is the one write path into the
 * ledger (ADR-023), injected by every module that moves stock, while only
 * the stock controller calls these two reads.
 */
/**
 * The stock list's filters as conditions (ADR-051), shared by the list and
 * by its counts, so "Expiring soon 2" counts exactly the rows pressing it
 * shows.
 */
function filtersOf(query: ListStockDto, organizationId: string): SQL[] {
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

  if (query.variantId) {
    scope.push(eq(stockLevels.variantId, query.variantId));
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
    scope.push(or(itemMatches(terms), codeMatches(lots.code, terms))!);
  }

  if (query.expiringWithin) {
    scope.push(
      sql`${lots.expiresAt} <= current_date + ${query.expiringWithin}::int`,
    );
  }

  // The same pool as a waiting cost row: its variant, and its lot or none.
  if (query.needsCost === 'true') {
    scope.push(sql`exists (
      select 1 from (${openNeedsCost(organizationId)}) waiting
      where waiting.variant_id = ${stockLevels.variantId}
        and waiting.lot_id is not distinct from ${stockLevels.lotId}
    )`);
  }

  return scope;
}

/** A stock row's lot, in the same organization. Left-joined by callers. */
function lotJoin(organizationId: string) {
  return and(
    eq(lots.id, stockLevels.lotId),
    eq(lots.organizationId, organizationId),
  );
}

@Injectable()
export class StockReadsService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * Current stock, a page at a time, in the order people read a stock sheet:
   * location name, then SKU, then lot code, with the row id last so the
   * order is total (ADR-051).
   *
   * It read the whole organization on every call until ADR-051 measured it:
   * 520 ms at the large scale, nearly all of it building and sending fifteen
   * thousand rows. A page is fifty unless asked otherwise.
   *
   * The cursor is a stock row's id, as every keyset list's is, but the order
   * is by names, so the cursor row's names are read back and compared as a
   * row value. Sorting by names cannot come from one index, so each page
   * still sorts the organization's matching rows: tens of milliseconds at the
   * large scale. If the plan check ever flags it, the fix is ordering by an
   * indexed key instead.
   *
   * Reads the cache and never aggregates the ledger (ADR-025). The join is
   * three tables deep, which `TenantDb.selectJoined` does not express, so
   * this drops to a raw handle and applies the scope by hand.
   */
  list(query: ListStockDto = {}) {
    const limit = query.limit ?? STOCK_PAGE_SIZE;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const scope = filtersOf(query, organizationId);
      const lotOf = lotJoin(organizationId);

      const order = sql`(${locations.name}, ${productVariants.sku}, coalesce(${lots.code}, ''), ${stockLevels.id})`;

      if (query.before) {
        const [cursor] = await tx
          .select({
            locationName: locations.name,
            sku: productVariants.sku,
            lotCode: sql<string>`coalesce(${lots.code}, '')`,
            id: stockLevels.id,
          })
          .from(stockLevels)
          .innerJoin(
            productVariants,
            eq(productVariants.id, stockLevels.variantId),
          )
          .innerJoin(locations, eq(locations.id, stockLevels.locationId))
          .leftJoin(lots, lotOf)
          .where(
            and(
              eq(stockLevels.organizationId, organizationId),
              eq(stockLevels.id, query.before),
            ),
          );

        // Another tenant's row, or no row: either way not a place in this
        // list, and a 400 rather than a 404 says nothing about whether it
        // exists elsewhere.
        if (!cursor) {
          throw new BadRequestException(
            t({
              id: 'stock.cursorList',
              defaultMessage: 'That cursor is not in this list',
            }),
          );
        }

        scope.push(
          sql`${order} > (${cursor.locationName}, ${cursor.sku}, ${cursor.lotCode}, ${cursor.id}::uuid)`,
        );
      }

      const rows = await tx
        .select({
          id: stockLevels.id,
          variantId: stockLevels.variantId,
          sku: productVariants.sku,
          productName: products.name,
          variantName: productVariants.name,
          unitOfMeasure: productVariants.unitOfMeasure,
          locationId: stockLevels.locationId,
          locationName: locations.name,
          locationCode: locations.code,
          lotId: stockLevels.lotId,
          lotCode: lots.code,
          lotExpiresAt: lots.expiresAt,
          // Whether the code was ours to invent, and so whether it can be
          // corrected rather than reclassified (MovementLotDto).
          lotIsAssigned: lots.isAssigned,
          quantity: stockLevels.quantity,
        })
        .from(stockLevels)
        .innerJoin(
          productVariants,
          eq(productVariants.id, stockLevels.variantId),
        )
        // Inner: every variant belongs to a product, and the product name
        // is what people recognise — most variants have no name of their own.
        .innerJoin(products, eq(products.id, productVariants.productId))
        .innerJoin(locations, eq(locations.id, stockLevels.locationId))
        // Left, because lot_id is null for every untracked variant and an
        // inner join would silently drop most of the warehouse.
        .leftJoin(lots, lotOf)
        .where(and(...scope))
        .orderBy(
          asc(locations.name),
          asc(productVariants.sku),
          sql`coalesce(${lots.code}, '')`,
          asc(stockLevels.id),
        )
        // One past the page, so the page knows whether there is more.
        .limit(limit + 1);

      return pageOf(rows, limit);
    });
  }

  /**
   * How many rows each quick filter would show (ADR-055), beside its
   * button: "Expiring soon 2", "Needs a cost 1". Each is counted with the
   * list's own filters and the others' left off, so the number is the
   * rows pressing that one shows. Expiring means within 90 days unless
   * asked otherwise, the threshold the expiry chips turn amber at.
   */
  counts(query: ListStockDto = {}) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const { expiringWithin, ...rest } = query;
      const unfiltered = { ...rest, needsCost: undefined };

      const count = async (filters: ListStockDto) => {
        const [row] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(stockLevels)
          .innerJoin(
            productVariants,
            eq(productVariants.id, stockLevels.variantId),
          )
          .innerJoin(products, eq(products.id, productVariants.productId))
          .innerJoin(locations, eq(locations.id, stockLevels.locationId))
          .leftJoin(lots, lotJoin(organizationId))
          .where(and(...filtersOf(filters, organizationId)));
        return row.count;
      };

      return {
        expiring: await count({
          ...unfiltered,
          expiringWithin: expiringWithin ?? 90,
        }),
        needsCost: await count({ ...unfiltered, needsCost: 'true' }),
      };
    });
  }

  /**
   * The ledger, read. Newest first, keyset cursor on the UUIDv7 id — the same
   * shape as the audit log, for the same reason: the table is append-only, so
   * offset paging would shift every page down as rows arrive at the head.
   *
   * Four left joins, so this drops to a raw handle like list() does. Two are
   * the same table aliased, because a transfer names both a source and a
   * destination. Left throughout: a movement with no source is inbound, a lot
   * is null for untracked variants, and an actor may be a tombstone (ADR-012)
   * — an inner join would drop exactly the rows the RESTRICT constraints exist
   * to preserve.
   *
   * The SKU is not joined. It is snapshotted on the row (ADR-023) so a rename
   * does not rewrite history.
   */
  listMovements(query: ListMovementsDto) {
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
      ].filter((f): f is SQL => f !== undefined);

      // One more than asked for, so the presence of a next page is known
      // without a second count query.
      const rows = await tx
        .select({
          id: stockMovements.id,
          sku: stockMovements.sku,
          quantity: stockMovements.quantity,
          reason: stockMovements.reason,
          reasonDetail: stockMovements.reasonDetail,
          note: stockMovements.note,
          fromLocationName: from.name,
          toLocationName: to.name,
          lotCode: lots.code,
          actorEmail: users.email,
          createdAt: stockMovements.createdAt,
        })
        .from(stockMovements)
        .leftJoin(from, eq(from.id, stockMovements.fromLocationId))
        .leftJoin(to, eq(to.id, stockMovements.toLocationId))
        .leftJoin(lots, eq(lots.id, stockMovements.lotId))
        .leftJoin(users, eq(users.id, stockMovements.actorId))
        .where(and(...filters))
        .orderBy(desc(stockMovements.id))
        .limit(limit + 1);

      return pageOf(rows, limit);
    });
  }
}
