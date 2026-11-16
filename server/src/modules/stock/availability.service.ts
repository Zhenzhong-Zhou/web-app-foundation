import { Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import { todayOf } from '../../core/organizations/time-zone';
import { assertOwnIds } from '../../database/own-ids';
import { orderLines, products } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { loadOrder } from '../orders/load-order';
import { holdsFor, type LineHold } from './availability';
import { codeFigures } from './code-figures';
import { namesIn } from './item-name';
import type { Tx } from './stock.service';
import { UNKNOWN_ITEM } from './stock-reads.service';

/** Reads over what open orders hold (ADR-045). Nothing here writes. */
@Injectable()
export class AvailabilityService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * Per product: on hand at every place, what of it is not usable and
   * why, held, free and backordered; one item's alone with `productId`,
   * which is this organization's or a 400.
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

/** A row of the list, as Postgres returns it. */
type AvailabilityRow = {
  variant_id: string;
  sku: string;
  product_name: string;
  variant_name: string | null;
  unit_of_measure: string;
  on_hand: string;
  not_usable: string;
  expired: string;
  issued: string;
  unavailable: string;
  held: string;
  free: string;
  short: string;
};

/**
 * Per product, from a code's figures (code-figures.ts), the one read the
 * Inventory page, Where it stands and Reorder share (ADR-093): on hand
 * at every place, what of it is not usable and why, held, free and what
 * confirmed sales want beyond their holds. Only products with stock or
 * open demand are listed; with `promisedOnly`, only those with open
 * demand: what the Inventory page's "Promised to customers" table shows.
 * That list grows with open orders, not with the catalogue, where the
 * full one was 5,000 rows at ADR-051's large scale. With `productId`,
 * that item's variants alone (ADR-092). Each item named in the reader's
 * language (ADR-056).
 */
async function availability(
  tx: Tx,
  organizationId: string,
  locale: Locale,
  promisedOnly: boolean,
  productId?: string,
) {
  const org = sql`${organizationId}::uuid`;
  const today = await todayOf(tx, organizationId);
  const listed = promisedOnly
    ? sql`f.still_needed > 0`
    : sql`(f.on_hand > 0 or f.still_needed > 0)`;
  const ofItem = productId ? sql`and pr.id = ${productId}::uuid` : sql``;
  // Figures worked out only for the items that can be listed: those
  // with an open line, on order_lines_open_idx, when promised alone.
  const variants = promisedOnly
    ? sql`(select ol.variant_id from order_lines ol
        where ol.organization_id = ${org}
          and not ol.is_closed_short
          and ol.quantity_ordered > ol.quantity_fulfilled)`
    : productId
      ? sql`(select iv.id from product_variants iv
          where iv.organization_id = ${org}
            and iv.product_id = ${productId}::uuid)`
      : sql`(select ov.id from product_variants ov
          where ov.organization_id = ${org})`;
  const shown = namesIn(locale, organizationId, {
    product: 'pr',
    variant: 'pv',
  });

  const { rows } = await tx.execute<AvailabilityRow>(sql`
    with f as materialized (${codeFigures(organizationId, today, variants)})
    select
      pv.id as variant_id,
      pv.sku,
      ${shown.productName} as product_name,
      ${shown.variantName} as variant_name,
      pv.unit_of_measure,
      f.on_hand::numeric(18, 4)::text as on_hand,
      f.not_usable::numeric(18, 4)::text as not_usable,
      f.expired::numeric(18, 4)::text as expired,
      f.issued::numeric(18, 4)::text as issued,
      f.unavailable::numeric(18, 4)::text as unavailable,
      f.held::numeric(18, 4)::text as held,
      f.free::numeric(18, 4)::text as free,
      f.short::numeric(18, 4)::text as short
    from f
    join product_variants pv
      on pv.id = f.variant_id
      and pv.organization_id = ${org}
    join products pr
      on pr.id = pv.product_id
      and pr.organization_id = ${org}
    where ${listed}
      ${ofItem}
    order by pv.sku
  `);

  return rows.map((row) => ({
    variantId: row.variant_id,
    sku: row.sku,
    productName: row.product_name,
    variantName: row.variant_name,
    unitOfMeasure: row.unit_of_measure,
    onHand: row.on_hand,
    notUsable: row.not_usable,
    expired: row.expired,
    issued: row.issued,
    unavailable: row.unavailable,
    held: row.held,
    free: row.free,
    backordered: row.short,
  }));
}
