import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import { assertOwnIds } from '../../database/own-ids';
import { orderLines, products } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { loadOrder } from '../orders/load-order';
import { availability, holdsFor, type LineHold } from './availability';
import { UNKNOWN_ITEM } from './stock-reads.service';

/** Reads over what open orders hold (ADR-045). Nothing here writes. */
@Injectable()
export class AvailabilityService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * Per product: on hand where promisable, held, free, backordered; one
   * item's alone with `productId`, which is this organization's or a 400.
   */
  async list(locale: Locale, promisedOnly = false, productId?: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await assertOwnIds(
        tx,
        products,
        organizationId,
        [productId],
        UNKNOWN_ITEM,
      );
      return availability(tx, organizationId, locale, promisedOnly, productId);
    });
  }

  /**
   * What each line of one order holds and still lacks. Empty for anything but
   * a confirmed sale, which is the only thing that holds stock.
   */
  async forOrder(orderId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      // A 404 for an order that is not this organization's, before anything else.
      await loadOrder(tx, organizationId, orderId);

      const lines = await tx
        .select({ variantId: orderLines.variantId })
        .from(orderLines)
        .where(
          and(
            eq(orderLines.organizationId, organizationId),
            eq(orderLines.orderId, orderId),
          ),
        );

      const holds: LineHold[] = [];

      for (const { variantId } of lines) {
        const { lines: all } = await holdsFor(tx, organizationId, variantId);
        holds.push(...all.filter((line) => line.orderId === orderId));
      }

      return holds.map((line) => ({
        lineId: line.lineId,
        outstanding: line.outstanding,
        held: line.held,
        short: line.short,
      }));
    });
  }
}
