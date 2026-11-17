import { Injectable, NotFoundException } from '@nestjs/common';
import { type SQL, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import { todayOf } from '../../core/organizations/time-zone';
import type { ReorderSource } from '../../database/schema';
import { products, productVariants } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { codeFigures } from './code-figures';
import { comingLinesOf, holdLinesOf, usableLotsOf } from './code-lines';
import type {
  CodeStanding,
  ComingPurchase,
  ComingRun,
  ProductStock,
  StockHold,
  UsableLot,
} from './dto/where-it-stands-response.dto';
import { namesIn } from './item-name';
import { positionsOf } from './reorder-position';
import type { ReorderStatus } from './reorder-status';
import { placesOf } from './stock-grouped.service';

/** Quantities as the API sends them: four places, as the columns hold them. */
function quantity(column: SQL): SQL {
  return sql`(${column})::numeric(18, 4)::text`;
}

/** What the reader may see beyond the figures (ADR-080; ADR-093). */
export interface StandingSight {
  /** `locations.view`: places by name, else the usable lots alone. */
  places: boolean;
  /** `orders.view`: Held's sales and Coming's purchases. */
  orders: boolean;
  /** `production.view`: Coming's runs. */
  runs: boolean;
}

/** A code's row as the statement reads it. */
type CodeRow = {
  variant_id: string;
  sku: string;
  variant_name: string | null;
  unit_of_measure: string;
  is_active: boolean;
  on_hand: string;
  usable: string;
  not_usable: string;
  expired: string;
  issued: string;
  unavailable: string;
  held: string;
  free: string;
  still_needed: string;
  short: string;
  coming: string;
  coming_on: string | null;
  position: string;
  expires_first: string | null;
  reorder_point: string | null;
  status: ReorderStatus | null;
};

/** Each of a list's rows under its code, in the statement's order. */
function byCode<T, R>(
  rows: (T & { variant_id: string })[],
  shape: (row: T) => R,
): Map<string, R[]> {
  const found = new Map<string, R[]>();
  for (const row of rows) {
    const list = found.get(row.variant_id) ?? [];
    list.push(shape(row));
    found.set(row.variant_id, list);
  }
  return found;
}

/**
 * Where it stands (ADR-093, R8): an item's codes, the low first, each
 * with its figures from the one read (code-figures.ts) and the lines
 * behind them (code-lines.ts): Held's sales, Coming's purchases and
 * runs, and By place and lot; and Reorder's suggestion, Buy or Make's
 * quantity. Gated inside: the caller has `stock.view`,
 * and each part beyond the figures is read only for a reader who may see
 * it (StandingSight), the number kept where the documents are not
 * ("Held 20 · for 2 orders").
 */
@Injectable()
export class WhereItStandsService {
  constructor(private readonly tenantDb: TenantDb) {}

  read(
    productId: string,
    locale: Locale,
    sight: StandingSight,
  ): Promise<ProductStock> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const org = sql`${organizationId}::uuid`;
      const today = await todayOf(tx, organizationId);
      const variants = sql`(
        select v.id from product_variants v
        where v.organization_id = ${org}
          and v.product_id = ${productId}::uuid
      )`;
      const shown = namesIn(locale, organizationId);

      // Out, then low, then the rest, each by code, a number by its
      // value: the low first (ADR-093).
      const { rows: codes } = await tx.execute<CodeRow>(sql`
        with f as materialized (${codeFigures(organizationId, today, variants)})
        select
          ${productVariants.id} as variant_id,
          ${productVariants.sku} as sku,
          ${shown.variantName} as variant_name,
          ${productVariants.unitOfMeasure} as unit_of_measure,
          ${productVariants.isActive} and ${products.isActive} as is_active,
          ${quantity(sql`f.on_hand`)} as on_hand,
          ${quantity(sql`f.usable`)} as usable,
          ${quantity(sql`f.not_usable`)} as not_usable,
          ${quantity(sql`f.expired`)} as expired,
          ${quantity(sql`f.issued`)} as issued,
          ${quantity(sql`f.unavailable`)} as unavailable,
          ${quantity(sql`f.held`)} as held,
          ${quantity(sql`f.free`)} as free,
          ${quantity(sql`f.still_needed`)} as still_needed,
          ${quantity(sql`f.short`)} as short,
          ${quantity(sql`f.coming`)} as coming,
          f.coming_on::text as coming_on,
          ${quantity(sql`f.position`)} as position,
          f.expires_first::text as expires_first,
          ${quantity(sql`f.reorder_point`)} as reorder_point,
          f.status
        from ${productVariants}
        join ${products}
          on ${products.id} = ${productVariants.productId}
          and ${products.organizationId} = ${org}
        join f on f.variant_id = ${productVariants.id}
        where ${productVariants.organizationId} = ${org}
          and ${productVariants.productId} = ${productId}::uuid
        order by
          case f.status when 'out' then 0 when 'low' then 1 else 2 end,
          ${productVariants.sku} collate numeric_order,
          ${productVariants.id}
      `);

      // Its codes come from the item, so none means no such item here.
      if (codes.length === 0) {
        const [item] = await tx
          .select({ id: products.id })
          .from(products)
          .where(
            sql`${products.organizationId} = ${org} and ${products.id} = ${productId}::uuid`,
          );
        if (!item) {
          throw new NotFoundException(
            t({ id: 'products.suchProduct', defaultMessage: 'No such item' }),
          );
        }
        return { codes: [] };
      }

      // Buy or Make's quantity, for the codes with a point: Reorder's
      // suggestion, by its one rule (reorder-position.ts; ADR-085).
      const { rows: pointRows } = await tx.execute<{
        variant_id: string;
        source: ReorderSource;
        suggestion: string;
      }>(sql`
        select
          p.variant_id,
          p.source,
          ${quantity(sql`p.suggestion`)} as suggestion
        from (${positionsOf(organizationId, today, variants)}) p
      `);
      const points = new Map(pointRows.map((row) => [row.variant_id, row]));

      // Read for the count whoever reads; its documents sent only with
      // orders.view.
      const { rows: holdRows } = await tx.execute<{
        variant_id: string;
        order_id: string;
        number: string;
        partner_name: string;
        expected_at: string | null;
        wanted: string;
        held: string;
        short: string;
      }>(sql`
        select
          h.variant_id,
          h.order_id,
          h.number,
          h.partner_name,
          h.expected_at::text as expected_at,
          ${quantity(sql`h.wanted`)} as wanted,
          ${quantity(sql`h.held`)} as held,
          ${quantity(sql`h.wanted - h.held`)} as short
        from (${holdLinesOf(organizationId, today, variants)}) h
        order by h.variant_id, h.confirmed_at, h.order_id
      `);
      const holds = byCode(holdRows, (row): StockHold => ({
        orderId: row.order_id,
        number: row.number,
        partnerName: row.partner_name,
        expectedAt: row.expected_at,
        wanted: row.wanted,
        held: row.held,
        short: row.short,
      }));

      const kinds = [
        ...(sight.orders ? ['purchase'] : []),
        ...(sight.runs ? ['run'] : []),
      ];
      const { rows: comingRows } =
        kinds.length > 0
          ? await tx.execute<{
              variant_id: string;
              kind: 'purchase' | 'run';
              id: string;
              number: string | null;
              partner_name: string | null;
              quantity: string;
              expected_at: string | null;
              late: boolean;
            }>(sql`
              select
                c.variant_id,
                c.kind,
                c.id,
                c.number,
                c.partner_name,
                ${quantity(sql`c.quantity`)} as quantity,
                c.expected_at::text as expected_at,
                c.late
              from (${comingLinesOf(organizationId, today, variants)}) c
              where c.kind in (${sql.join(
                kinds.map((kind) => sql`${kind}`),
                sql`, `,
              )})
              order by c.variant_id, c.expected_at nulls last, c.number, c.id
            `)
          : { rows: [] };
      const purchases = byCode(
        comingRows.filter((row) => row.kind === 'purchase'),
        (row): ComingPurchase => ({
          orderId: row.id,
          number: row.number!,
          partnerName: row.partner_name!,
          quantity: row.quantity,
          expectedAt: row.expected_at,
          late: row.late,
        }),
      );
      const runs = byCode(
        comingRows.filter((row) => row.kind === 'run'),
        (row): ComingRun => ({
          runId: row.id,
          reference: row.number,
          partnerName: row.partner_name,
          quantity: row.quantity,
        }),
      );

      const places = sight.places
        ? await placesOf(tx, organizationId, locale, variants, {}, true)
        : null;
      const lots = sight.places
        ? null
        : byCode(
            (
              await tx.execute<{
                variant_id: string;
                lot_id: string | null;
                lot_code: string | null;
                expires_at: string | null;
                quantity: string;
                places: number;
              }>(sql`
                select
                  u.variant_id,
                  u.lot_id,
                  u.lot_code,
                  u.expires_at::text as expires_at,
                  ${quantity(sql`u.quantity`)} as quantity,
                  u.places
                from (${usableLotsOf(organizationId, today, variants)}) u
                order by u.variant_id, u.expires_at asc nulls last,
                  u.lot_code, u.lot_id
              `)
            ).rows,
            (row): UsableLot => ({
              lotId: row.lot_id,
              lotCode: row.lot_code,
              expiresAt: row.expires_at,
              quantity: row.quantity,
              places: row.places,
            }),
          );

      return {
        codes: codes.map((row): CodeStanding => ({
          variantId: row.variant_id,
          sku: row.sku,
          variantName: row.variant_name,
          unitOfMeasure: row.unit_of_measure,
          isActive: row.is_active,
          onHand: row.on_hand,
          usable: row.usable,
          notUsable: row.not_usable,
          expired: row.expired,
          issued: row.issued,
          unavailable: row.unavailable,
          held: row.held,
          free: row.free,
          stillNeeded: row.still_needed,
          short: row.short,
          coming: row.coming,
          comingOn: row.coming_on,
          position: row.position,
          expiresFirst: row.expires_first,
          reorderPoint: row.reorder_point,
          status: row.status,
          source: points.get(row.variant_id)?.source ?? null,
          suggestion: points.get(row.variant_id)?.suggestion ?? null,
          heldOrders: holds.get(row.variant_id)?.length ?? 0,
          holds: sight.orders ? (holds.get(row.variant_id) ?? []) : null,
          purchases: sight.orders
            ? (purchases.get(row.variant_id) ?? [])
            : null,
          runs: sight.runs ? (runs.get(row.variant_id) ?? []) : null,
          places: places ? (places.get(row.variant_id) ?? []) : null,
          lots: lots ? (lots.get(row.variant_id) ?? []) : null,
        })),
      };
    });
  }
}
