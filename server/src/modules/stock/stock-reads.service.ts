import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt, lt, or, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { pageOf } from '../../common/keyset';
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
import { ListMovementsDto } from './dto/list-movements.dto';

export interface ListStockFilters {
  locationId?: string;
  variantId?: string;
  includeEmpty?: string;
}

/**
 * Reading stock: what is on the shelves now, and the ledger that put it
 * there.
 *
 * Its own service because StockService is the one write path into the
 * ledger (ADR-023), injected by every module that moves stock, while only
 * the stock controller calls these two reads.
 */
@Injectable()
export class StockReadsService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * Current stock, optionally narrowed to one location or one variant.
   *
   * Reads the cache and never aggregates the ledger (ADR-025). The join is
   * three tables deep — variant for the SKU, location for the name, lot for the
   * code — which `TenantDb.selectJoined` does not express, so this drops to a
   * raw handle. The scope is applied by hand as a result; that is the cost of
   * the escape hatch and the reason it is one query rather than the default.
   */
  list(filters: ListStockFilters = {}) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const scope = [eq(stockLevels.organizationId, organizationId)];

      if (filters.locationId) {
        scope.push(eq(stockLevels.locationId, filters.locationId));
      }

      if (filters.variantId) {
        scope.push(eq(stockLevels.variantId, filters.variantId));
      }

      /**
       * Zero rows are kept, not deleted — a shelf that emptied yesterday is a
       * fact worth having, and `LocationsService` depends on the row surviving
       * so an emptied leaf can still gain children. But "what is on this shelf"
       * means what is there, so they are hidden unless asked for.
       */
      if (filters.includeEmpty !== 'true') {
        scope.push(gt(stockLevels.quantity, '0'));
      }

      return (
        tx
          .select({
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
          .leftJoin(lots, eq(lots.id, stockLevels.lotId))
          .where(and(...scope))
          .orderBy(asc(locations.name), asc(productVariants.sku))
      );
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
