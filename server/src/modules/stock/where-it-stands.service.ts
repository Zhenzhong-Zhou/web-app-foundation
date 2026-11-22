import { Injectable, NotFoundException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import { todayOf } from '../../core/organizations/time-zone';
import type { LotExpiry, ReorderSource } from '../../database/schema';
import { products, productVariants } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import {
  codeFigures,
  figureColumns,
  type FigureRow,
  figuresOf,
  quantity,
} from './code-figures';
import { comingLinesOf, holdLinesOf, usableLotsOf } from './code-lines';
import type { Movement } from './dto/stock-response.dto';
import type {
  CodeStanding,
  ComingPurchase,
  ComingRun,
  ProductStock,
  StockHold,
  UsableLot,
} from './dto/where-it-stands-response.dto';
import { namesIn } from './item-name';
import { movementPage } from './movement-view';
import { positionsOf } from './reorder-position';
import { placesOf } from './stock-grouped.service';

/** Latest movements: a code's newest, as many as the board draws (R12). */
const LATEST_MOVEMENTS = 5;

/** What the reader may see beyond the figures (ADR-080; ADR-093). */
export interface StandingSight {
  /** `locations.view`: places by name, else the usable lots alone. */
  places: boolean;
  /** `orders.view`: Held's sales and Coming's purchases. */
  orders: boolean;
  /** `production.view`: Coming's runs. */
  runs: boolean;
  /** `partners.view`: a sample's recipient in Latest movements (125). */
  partners: boolean;
}

/** A code's row as the statement reads it: its own columns and figures. */
type CodeRow = FigureRow & {
  variant_id: string;
  sku: string;
  variant_name: string | null;
  unit_of_measure: string;
  is_active: boolean;
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
 * runs, and By place and lot; Reorder's suggestion, Buy or Make's
 * quantity; and its latest movements (movement-view.ts). Gated inside: the caller has `stock.view`,
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
          ${figureColumns()}
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
                expiry: LotExpiry | null;
                is_assigned: boolean | null;
                supplier_lot: string | null;
                quantity: string;
                places: number;
              }>(sql`
                select
                  u.variant_id,
                  u.lot_id,
                  u.lot_code,
                  u.expires_at::text as expires_at,
                  u.expiry,
                  u.is_assigned,
                  u.supplier_lot,
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
              expiry: row.expiry,
              isAssigned: row.is_assigned,
              supplierLot: row.supplier_lot,
              quantity: row.quantity,
              places: row.places,
            }),
          );

      // Latest movements, each code's newest as Movements lists that code,
      // a stock card, by the same sight (ADR-093, R12): one page per code,
      // read from the code's own index.
      const latest = new Map<string, Movement[]>();
      for (const row of codes) {
        const page = await movementPage(
          tx,
          organizationId,
          { variantId: row.variant_id, limit: LATEST_MOVEMENTS },
          locale,
          sight,
        );
        latest.set(row.variant_id, page.entries);
      }

      return {
        codes: codes.map((row): CodeStanding => ({
          variantId: row.variant_id,
          sku: row.sku,
          variantName: row.variant_name,
          unitOfMeasure: row.unit_of_measure,
          isActive: row.is_active,
          ...figuresOf(row),
          stillNeeded: row.still_needed,
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
          latestMovements: latest.get(row.variant_id) ?? [],
        })),
      };
    });
  }
}
