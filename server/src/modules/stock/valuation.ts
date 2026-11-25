import { type SQL, sql } from 'drizzle-orm';

import type {
  LotChangeDetail,
  ReceiptDetail,
} from '../../common/movement-reasons';
import { todayOf } from '../../core/organizations/time-zone';
import type { stockMovements } from '../../database/schema';
import { openNeedsCost } from '../costs/open-needs-cost';
import { baseCurrency, rateOnOrBefore } from './rates';
import type { Tx } from './stock.service';

type Movement = typeof stockMovements.$inferSelect;

/** What a receipt against a priced purchase line paid per unit (ADR-035). */
export interface PurchaseCost {
  unitPrice: string;
  currency: string;
}

/** What one movement is worth, before its direction is applied. */
interface Valued {
  /** Positive, in the base currency. */
  value: string;
  unitPrice: string | null;
  currency: string | null;
  exchangeRate: string | null;
  needsCost: boolean;
  /**
   * The pool whose average valued a return with no shipped cost (#661),
   * the row's mark (AT_POOL_AVERAGE); unset for every other.
   */
  averageOf?: string;
}

/**
 * The reference a return's value row carries when its pool's average
 * valued it, for want of a cost it shipped at (ADR-048 amended, #661): the
 * row says where its value came from, and Set cost may correct it.
 */
export const AT_POOL_AVERAGE = 'valuation_pool';

function unvalued(cost: PurchaseCost | null): Valued {
  return {
    value: '0',
    unitPrice: cost?.unitPrice ?? null,
    currency: cost?.currency ?? null,
    exchangeRate: null,
    needsCost: true,
  };
}

function derived(value: string): Valued {
  return {
    value,
    unitPrice: null,
    currency: null,
    exchangeRate: null,
    needsCost: false,
  };
}

/**
 * Values one movement and applies it to its pool (ADR-048), inside the
 * movement's own transaction.
 *
 * Called by `StockService.recordWithin` and nothing else, so every movement
 * is valued by the one write path the ledger already has (ADR-023).
 *
 * The pool is locked first, as `stock_levels` is: an outbound reads the
 * pool's average, and two outbounds reading it together would each take
 * value from a balance the other had already spent. Arithmetic stays in
 * Postgres (ADR-025).
 *
 * Returns whether the movement waits for a cost, as its value row says,
 * so the write can say so (ADR-093, 90a).
 */
export async function valueMovement(
  tx: Tx,
  organizationId: string,
  movement: Movement,
  cost: PurchaseCost | null,
): Promise<boolean> {
  const inbound = movement.fromLocationId === null;
  const outbound = movement.toLocationId === null;

  // The lot change that starts a code's lot tracking carries no value of
  // its own: its value went into the lot with the pool and its rows,
  // relabelled in the same transaction (ADR-094; LotTrackingService.start).
  // Any other lot change carries its share from one pool into the other.
  if (movement.reason === 'lot_change') {
    if (movement.reasonDetail === ('lots_started' satisfies LotChangeDetail)) {
      return false;
    }
    return valueLotChange(tx, organizationId, movement);
  }

  // A transfer. The pool is not per location, so nothing about its value
  // changed.
  if (!inbound && !outbound) return false;

  if (cost && movement.reason !== 'receipt') {
    throw new Error(`A ${movement.reason} carries no purchase cost`);
  }

  const poolId = await lockPool(
    tx,
    organizationId,
    movement.variantId,
    movement.lotId,
  );

  const valued = outbound
    ? await takeFromPool(tx, poolId, movement.quantity)
    : await valueInbound(tx, organizationId, poolId, movement, cost);

  const sign = outbound ? -1 : 1;

  await tx.execute(sql`
    update valuation_pools
    set quantity = quantity + ${sign}::integer * ${movement.quantity}::numeric,
        value = value + ${sign}::integer * ${valued.value}::numeric
    where id = ${poolId}::uuid
  `);

  await tx.execute(sql`
    insert into stock_valuations
      (organization_id, variant_id, lot_id, kind, movement_id, quantity, value,
       unit_price, currency, exchange_rate, needs_cost, reference_type,
       reference_id, actor_id)
    values (
      ${organizationId}::uuid, ${movement.variantId}::uuid,
      ${movement.lotId}::uuid, 'movement', ${movement.id}::uuid,
      ${sign}::integer * ${movement.quantity}::numeric,
      ${sign}::integer * ${valued.value}::numeric,
      ${valued.unitPrice}::numeric, ${valued.currency},
      ${valued.exchangeRate}::numeric, ${valued.needsCost},
      ${valued.averageOf ? AT_POOL_AVERAGE : null},
      ${valued.averageOf ?? null}::uuid,
      ${movement.actorId}::uuid
    )
  `);

  return valued.needsCost;
}

/**
 * The order every write that holds more than one of a code's pools takes
 * them in: the pool with no lot first, then by the lot's id. A move between
 * lots takes its two so (valueLotChange), and a late value every pool it
 * may reach (revaluation.ts), so neither holds one the other waits for.
 */
export function inLotOrder(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

/**
 * Locks a code's pools, each lot's, in lot order (inLotOrder), and gives
 * each pool's id by its lot: the one rule that keeps a move and a late
 * cost from each holding a pool the other waits for (review 50).
 */
export async function lockPools(
  tx: Tx,
  organizationId: string,
  variantId: string,
  lotIds: (string | null)[],
): Promise<Map<string | null, string>> {
  const pools = new Map<string | null, string>();
  for (const lotId of [...new Set(lotIds)].sort(inLotOrder)) {
    pools.set(lotId, await lockPool(tx, organizationId, variantId, lotId));
  }
  return pools;
}

/**
 * A lot change carries the value its stock has today (ADR-094, Q1a): the
 * first pool's share at its average, out of that pool and into the
 * second, two value rows of their own. Where the first pool has stock
 * still waiting for a cost, the row in waits too, carrying its share, so
 * Stock value lists the moved stock until what it waited for is costed
 * (openNeedsCost); the first pool's average is low while it waits. That
 * cost, given later, follows the stock moved (ADR-094, D5; revaluation.ts),
 * so the row in takes none of its own.
 *
 * Both pools are locked in the order of their lots (inLotOrder), as the
 * piles are (recordWithin): a move from A to B and one from B to A at two
 * places at once would otherwise each hold one pool and wait for the
 * other.
 */
async function valueLotChange(
  tx: Tx,
  organizationId: string,
  movement: Movement,
): Promise<boolean> {
  const pools = await lockPools(tx, organizationId, movement.variantId, [
    movement.lotId,
    movement.toLotId,
  ]);
  const leaves = pools.get(movement.lotId)!;
  const enters = pools.get(movement.toLotId)!;

  const { value } = await takeFromPool(tx, leaves, movement.quantity);

  const waiting = openNeedsCost(
    organizationId,
    sql`(${movement.variantId}::uuid)`,
  );
  const found = await tx.execute(sql`
    select exists (
      select 1
      from (${waiting}) o
      where o.lot_id is not distinct from ${movement.lotId}::uuid
    ) as waits
  `);
  const needsCost = (found.rows[0] as { waits: boolean }).waits;

  for (const [poolId, sign] of [
    [leaves, -1],
    [enters, 1],
  ] as const) {
    await tx.execute(sql`
      update valuation_pools
      set quantity = quantity + ${sign}::integer * ${movement.quantity}::numeric,
          value = value + ${sign}::integer * ${value}::numeric
      where id = ${poolId}::uuid
    `);
  }

  await tx.execute(sql`
    insert into stock_valuations
      (organization_id, variant_id, lot_id, kind, movement_id, quantity, value,
       needs_cost, actor_id)
    values
      (${organizationId}::uuid, ${movement.variantId}::uuid,
       ${movement.lotId}::uuid, 'lot_change', ${movement.id}::uuid,
       -${movement.quantity}::numeric, -${value}::numeric, false,
       ${movement.actorId}::uuid),
      (${organizationId}::uuid, ${movement.variantId}::uuid,
       ${movement.toLotId}::uuid, 'lot_change', ${movement.id}::uuid,
       ${movement.quantity}::numeric, ${value}::numeric, ${needsCost},
       ${movement.actorId}::uuid)
  `);

  return needsCost;
}

/**
 * Makes the pool row present and takes its lock — the `stock_levels`
 * pattern (ADR-025). DO UPDATE rather than DO NOTHING, because DO NOTHING
 * returns no row on conflict.
 */
export async function lockPool(
  tx: Tx,
  organizationId: string,
  variantId: string,
  lotId: string | null,
): Promise<string> {
  const result = await tx.execute(sql`
    insert into valuation_pools
      (organization_id, variant_id, lot_id, quantity, value)
    values (${organizationId}::uuid, ${variantId}::uuid, ${lotId}::uuid, 0, 0)
    on conflict on constraint valuation_pools_org_variant_lot_key
    do update set updated_at = now()
    returning id
  `);

  return (result.rows[0] as { id: string }).id;
}

/**
 * An outbound takes the pool's average. The last unit out takes whatever
 * value is left, so rounding never strands value in an empty pool.
 *
 * A pool holding less than is leaving would mean it has drifted from
 * `stock_levels`, which refused the movement first if the shelf was short.
 * Taking everything then drives the pool negative, and its check aborts the
 * transaction: a bug surfaced rather than a balance quietly wrong.
 */
async function takeFromPool(
  tx: Tx,
  poolId: string,
  quantity: string,
): Promise<Valued> {
  const result = await tx.execute(sql`
    select case
             when quantity <= ${quantity}::numeric then value
             else round(${quantity}::numeric * value / quantity, 6)
           end as value
    from valuation_pools
    where id = ${poolId}::uuid
  `);

  return derived((result.rows[0] as { value: string }).value);
}

async function valueInbound(
  tx: Tx,
  organizationId: string,
  poolId: string,
  movement: Movement,
  cost: PurchaseCost | null,
): Promise<Valued> {
  switch (movement.reason) {
    case 'receipt':
      if (cost) return purchased(tx, organizationId, movement.quantity, cost);
      // A return recorded on Stock with no order has no shipment to come
      // back at, so it lands at its pool's average where there is one
      // (#661). Any other receipt by hand, or against an unpriced line, is
      // still a real delivery; it waits for a cost rather than being
      // refused (ADR-032).
      return (
        (movement.reasonDetail === ('returned' satisfies ReceiptDetail)
          ? await returnAtAverage(tx, organizationId, poolId, movement)
          : null) ?? unvalued(null)
      );

    case 'production':
      // The batch's cost exists only once its run closes (ADR-032), which
      // posts it.
      return unvalued(null);

    case 'return': {
      // A customer returns what they were sold, at what it cost when it
      // went — not at whatever the pool averages today. A shipment from
      // before costs were kept has no cost to come back at: the return
      // lands at its pool's average, marked so, or waits and takes a cost
      // on its own row (#661).
      const shipped =
        movement.referenceType === 'order_return' && movement.referenceId
          ? await shippedAt(tx, organizationId, movement)
          : null;

      return (
        shipped ??
        (await returnAtAverage(tx, organizationId, poolId, movement)) ??
        unvalued(null)
      );
    }

    default: {
      // An inbound adjustment. A voided shipment's reversal comes back at
      // the cost it left at; found stock rides at its pool's average, since
      // it was bought at the price its pool already carries, and waits for
      // a cost while that pool does.
      const reversed =
        movement.referenceType === 'shipment' && movement.referenceId
          ? await shippedAt(tx, organizationId, movement)
          : null;

      return (
        reversed ??
        (await atPoolAverage(tx, organizationId, poolId, movement)) ??
        unvalued(null)
      );
    }
  }
}

/**
 * A purchase, converted into the base currency at the latest rate on or
 * before today. With no base currency, or no rate for a foreign price, the
 * receipt is recorded at zero with its price kept, and waits for a cost.
 *
 * "Today" is the organization's, in its own time zone (ADR-072), rather
 * than Postgres's `current_date`, which is the session's day and so depends
 * on how the database is configured. A receipt at 5 pm in Vancouver reads
 * that day's rate, not tomorrow's, once the organization says it is in
 * Vancouver.
 */
async function purchased(
  tx: Tx,
  organizationId: string,
  quantity: string,
  cost: PurchaseCost,
): Promise<Valued> {
  const base = await baseCurrency(tx, organizationId);

  if (!base) return unvalued(cost);

  const applied =
    cost.currency === base
      ? null
      : await rateOnOrBefore(
          tx,
          organizationId,
          cost.currency,
          sql`${await todayOf(tx, organizationId)}::date`,
        );

  if (cost.currency !== base && !applied) return unvalued(cost);

  const result = await tx.execute(sql`
    select round(
      ${quantity}::numeric * ${cost.unitPrice}::numeric
        * ${applied ?? '1'}::numeric,
      6
    ) as value
  `);

  return {
    value: (result.rows[0] as { value: string }).value,
    unitPrice: cost.unitPrice,
    currency: cost.currency,
    exchangeRate: applied,
    needsCost: false,
  };
}

/**
 * The shipments a row in brings stock back from, by its movement's
 * reference: an order's return, its order's shipments not voided; a voided
 * shipment's reversal, the shipment it names. One select of their ids, for
 * the cost it comes back at (shippedAt) and the late cost's walk
 * (revaluation.ts) alike, its aliases its own, so the reference may name
 * the caller's row.
 */
export function shipmentsReversed(
  organizationId: string,
  referenceType: SQL,
  referenceId: SQL,
): SQL {
  return sql`
    select reversed_shipment.id
    from order_returns reversed_return
    join shipments reversed_shipment
      on reversed_shipment.organization_id = ${organizationId}::uuid
     and reversed_shipment.order_id = reversed_return.order_id
     and reversed_shipment.voided_at is null
    where ${referenceType} = 'order_return'
      and reversed_return.organization_id = ${organizationId}::uuid
      and reversed_return.id = ${referenceId}
    union all
    select ${referenceId}
    where ${referenceType} = 'shipment'
  `;
}

/**
 * The unit cost at which this stock left on the shipments it reverses
 * (shipmentsReversed), applied to what is coming back. Null when none of it was valued — a shipment from
 * before valuation began.
 *
 * The shipments' movements are matched by their own lot, the one the stock
 * comes back with, and the value taken from their value rows, whatever lot
 * those carry now: stock shipped with no lot before its code's lot tracking
 * started comes back with no lot, though its value rows have since taken
 * the start lot's (ADR-094, Q3a).
 */
async function shippedAt(
  tx: Tx,
  organizationId: string,
  movement: Movement,
): Promise<Valued | null> {
  const result = await tx.execute(sql`
    select round(
      ${movement.quantity}::numeric * sum(v.value) / sum(v.quantity),
      6
    ) as value
    from stock_valuations v
    join stock_movements m on m.id = v.movement_id
    where v.organization_id = ${organizationId}::uuid
      and v.kind = 'movement'
      and v.variant_id = ${movement.variantId}::uuid
      and m.organization_id = ${organizationId}::uuid
      and m.lot_id is not distinct from ${movement.lotId}::uuid
      and m.reason = 'shipment'
      and m.reference_type = 'shipment'
      and m.reference_id in (${shipmentsReversed(
        organizationId,
        sql`${movement.referenceType}::text`,
        sql`${movement.referenceId}::uuid`,
      )})
    having sum(v.quantity) <> 0
  `);

  const [row] = result.rows as { value: string }[];
  return row ? derived(row.value) : null;
}

/**
 * A return with no shipped cost at its pool's average (#661), its row
 * marked with the pool, so it says where its value came from.
 */
async function returnAtAverage(
  tx: Tx,
  organizationId: string,
  poolId: string,
  movement: Movement,
): Promise<Valued | null> {
  const valued = await atPoolAverage(tx, organizationId, poolId, movement);
  return valued && { ...valued, averageOf: poolId };
}

/**
 * The pool's current unit cost: null for an empty pool, and null while any
 * of its stock still waits for a cost, the whole or a part (ADR-048, amended
 * by ADR-094; #650). Those units sit in the pool at nothing, so its average
 * is low, 0 where all of it waits: stock taken in at it would read as
 * costed, and the cost given later would be spread over it as well. "Still
 * waiting" is `openNeedsCost`'s, the rows Stock value's Waiting for a cost
 * lists.
 */
async function atPoolAverage(
  tx: Tx,
  organizationId: string,
  poolId: string,
  movement: Movement,
): Promise<Valued | null> {
  const waiting = openNeedsCost(
    organizationId,
    sql`(${movement.variantId}::uuid)`,
  );

  const result = await tx.execute(sql`
    select round(${movement.quantity}::numeric * p.value / p.quantity, 6)
             as value
    from valuation_pools p
    where p.id = ${poolId}::uuid
      and p.quantity > 0
      and not exists (
        select 1
        from (${waiting}) o
        where o.lot_id is not distinct from p.lot_id
      )
  `);

  const [row] = result.rows as { value: string }[];
  return row ? derived(row.value) : null;
}
