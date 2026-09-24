import { ConflictException } from '@nestjs/common';
import { type SQL, sql } from 'drizzle-orm';

import type { Tx } from './stock.service';

/** One open sale line's hold on a product (ADR-045). */
export interface LineHold {
  variantId: string;
  lineId: string;
  orderId: string;
  /** What the line still needs: ordered minus shipped. */
  outstanding: string;
  /** What it holds: its share of stock, earliest confirmed first. */
  held: string;
  /** What it needs and cannot hold: the backorder. */
  short: string;
}

/**
 * Every open confirmed sale line, with what each holds (ADR-045).
 *
 * Computed, never stored. A line holds what is left of its product's supply
 * after every earlier-confirmed line, up to what it still needs — so when
 * stock runs short the first order confirmed keeps its hold and the last goes
 * short, rather than every order blocking every other. Supply is stock at
 * locations marked available: a retention or quarantine bin holds stock
 * nobody can promise (ADR-042).
 *
 * One query for one product or for all of them, so the rule exists once: the
 * availability list and the check that guards a shipment cannot disagree.
 */
function holdsSql(organizationId: string, variantId?: string): SQL {
  const onlySupply = variantId
    ? sql`and sl.variant_id = ${variantId}::uuid`
    : sql``;
  const onlyDemand = variantId
    ? sql`and ol.variant_id = ${variantId}::uuid`
    : sql``;

  return sql`
    with supply as (
      select sl.variant_id, sum(sl.quantity) as quantity
      from stock_levels sl
      join locations loc on loc.id = sl.location_id
      where sl.organization_id = ${organizationId}::uuid
        and loc.is_available
        ${onlySupply}
      group by sl.variant_id
    ),
    demand as (
      select
        ol.variant_id,
        ol.id as line_id,
        o.id as order_id,
        ol.quantity_ordered - ol.quantity_fulfilled as outstanding,
        coalesce(
          sum(ol.quantity_ordered - ol.quantity_fulfilled) over (
            partition by ol.variant_id
            order by o.confirmed_at, o.id, ol.id
            rows between unbounded preceding and 1 preceding
          ),
          0
        ) as before
      from order_lines ol
      join orders o on o.id = ol.order_id
      where ol.organization_id = ${organizationId}::uuid
        and o.direction = 'sale'
        and o.status = 'confirmed'
        and not ol.is_closed_short
        and ol.quantity_ordered > ol.quantity_fulfilled
        ${onlyDemand}
    )
    select
      d.variant_id,
      d.line_id,
      d.order_id,
      d.outstanding,
      -- Cast back to the column's type: a literal 0 winning greatest()
      -- would otherwise print as "0" beside "40.0000".
      greatest(0, least(d.outstanding, coalesce(s.quantity, 0) - d.before))::numeric(18, 4) as held
    from demand d
    left join supply s on s.variant_id = d.variant_id
  `;
}

/** One product's supply at available locations, and every line's hold on it. */
export async function holdsFor(
  tx: Tx,
  organizationId: string,
  variantId: string,
): Promise<{ supply: string; lines: LineHold[] }> {
  const [supply] = (
    await tx.execute(sql`
      select coalesce(sum(sl.quantity), 0)::numeric(18, 4)::text as quantity
      from stock_levels sl
      join locations loc on loc.id = sl.location_id
      where sl.organization_id = ${organizationId}::uuid
        and sl.variant_id = ${variantId}::uuid
        and loc.is_available
    `)
  ).rows as { quantity: string }[];

  const lines = (
    await tx.execute(sql`
      select
        h.variant_id,
        h.line_id,
        h.order_id,
        h.outstanding::text as outstanding,
        h.held::text as held,
        (h.outstanding - h.held)::text as short
      from (${holdsSql(organizationId, variantId)}) h
    `)
  ).rows as {
    variant_id: string;
    line_id: string;
    order_id: string;
    outstanding: string;
    held: string;
    short: string;
  }[];

  return {
    supply: supply.quantity,
    lines: lines.map((row) => ({
      variantId: row.variant_id,
      lineId: row.line_id,
      orderId: row.order_id,
      outstanding: row.outstanding,
      held: row.held,
      short: row.short,
    })),
  };
}

/**
 * Per product: on hand where it can be promised, held, free, and backordered.
 * Only products with stock or open demand are listed.
 */
export async function availability(tx: Tx, organizationId: string) {
  const rows = (
    await tx.execute(sql`
      with supply as (
        select sl.variant_id, sum(sl.quantity) as quantity
        from stock_levels sl
        join locations loc on loc.id = sl.location_id
        where sl.organization_id = ${organizationId}::uuid
          and loc.is_available
        group by sl.variant_id
      ),
      holds as (
        select
          h.variant_id,
          sum(h.held) as held,
          sum(h.outstanding) as demand
        from (${holdsSql(organizationId)}) h
        group by h.variant_id
      )
      select
        pv.id as variant_id,
        pv.sku,
        pv.unit_of_measure,
        coalesce(s.quantity, 0)::numeric(18, 4)::text as on_hand,
        coalesce(h.held, 0)::numeric(18, 4)::text as held,
        (coalesce(s.quantity, 0) - coalesce(h.held, 0))::numeric(18, 4)::text as free,
        (coalesce(h.demand, 0) - coalesce(h.held, 0))::numeric(18, 4)::text as backordered
      from product_variants pv
      left join supply s on s.variant_id = pv.id
      left join holds h on h.variant_id = pv.id
      where pv.organization_id = ${organizationId}::uuid
        and (s.variant_id is not null or h.variant_id is not null)
      order by pv.sku
    `)
  ).rows as {
    variant_id: string;
    sku: string;
    unit_of_measure: string;
    on_hand: string;
    held: string;
    free: string;
    backordered: string;
  }[];

  return rows.map((row) => ({
    variantId: row.variant_id,
    sku: row.sku,
    unitOfMeasure: row.unit_of_measure,
    onHand: row.on_hand,
    held: row.held,
    free: row.free,
    backordered: row.backordered,
  }));
}

/**
 * Serialises everything that spends one product's unheld stock (ADR-045).
 *
 * Transaction-scoped, released at commit or rollback. Without it two
 * transactions could each see the same fifty unheld units and both take them.
 * Callers touching several products take these in product-id order — the same
 * rule every row lock here follows — so they cannot deadlock.
 */
export async function lockProduct(
  tx: Tx,
  organizationId: string,
  variantId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${variantId}`}, 0))`,
  );
}

/**
 * Refuses to take more than may be taken (ADR-045).
 *
 * For an order: its own hold plus whatever nobody holds. For anything else —
 * a production release, a hand-out, a one-off shipment — only what nobody
 * holds. Compared in SQL, so no quantity goes through a double (ADR-025).
 * Locks the product first, so the answer stays true until the caller's
 * transaction ends.
 */
export async function assertTakeable(
  tx: Tx,
  input: {
    organizationId: string;
    variantId: string;
    quantity: string;
    sku: string;
    forOrderId?: string;
  },
): Promise<void> {
  await lockProduct(tx, input.organizationId, input.variantId);

  const { supply, lines } = await holdsFor(
    tx,
    input.organizationId,
    input.variantId,
  );

  const heldByOthers = lines
    .filter((line) => line.orderId !== input.forOrderId)
    .map((line) => sql`(${line.held}::numeric)`);

  const values = sql.join([sql`(0::numeric)`, ...heldByOthers], sql`, `);

  const [check] = (
    await tx.execute(sql`
      select
        (${supply}::numeric - sum(v.held)) < ${input.quantity}::numeric as too_much,
        greatest(${supply}::numeric - sum(v.held), 0)::numeric(18, 4)::text as takeable,
        sum(v.held)::numeric(18, 4)::text as held
      from (values ${values}) as v(held)
    `)
  ).rows as { too_much: boolean; takeable: string; held: string }[];

  if (check.too_much) {
    throw new ConflictException(
      `Only ${check.takeable} ${input.sku} can be taken: ${check.held} is held for ${
        input.forOrderId ? 'other orders' : 'confirmed orders'
      }.`,
    );
  }
}
