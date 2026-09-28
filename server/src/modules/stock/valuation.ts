import { type SQL, sql } from 'drizzle-orm';

import type { stockMovements } from '../../database/schema';
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
}

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
 */
export async function valueMovement(
  tx: Tx,
  organizationId: string,
  movement: Movement,
  cost: PurchaseCost | null,
): Promise<void> {
  const inbound = movement.fromLocationId === null;
  const outbound = movement.toLocationId === null;

  // A transfer. The pool is not per location, so nothing about its value
  // changed.
  if (!inbound && !outbound) return;

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
       unit_price, currency, exchange_rate, needs_cost, actor_id)
    values (
      ${organizationId}::uuid, ${movement.variantId}::uuid,
      ${movement.lotId}::uuid, 'movement', ${movement.id}::uuid,
      ${sign}::integer * ${movement.quantity}::numeric,
      ${sign}::integer * ${valued.value}::numeric,
      ${valued.unitPrice}::numeric, ${valued.currency},
      ${valued.exchangeRate}::numeric, ${valued.needsCost},
      ${movement.actorId}::uuid
    )
  `);
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
      // A receipt by hand, or against an unpriced line, is still a real
      // delivery; it waits for a cost rather than being refused (ADR-032).
      return cost
        ? purchased(tx, organizationId, movement.quantity, cost)
        : unvalued(null);

    case 'production':
      // The batch's cost exists only once its run closes (ADR-032), which
      // posts it.
      return unvalued(null);

    case 'return': {
      // A customer returns what they were sold, at what it cost when it
      // went — not at whatever the pool averages today.
      const shipped =
        movement.referenceType === 'order_return' && movement.referenceId
          ? await shippedAt(
              tx,
              organizationId,
              movement,
              sql`
                select s.id
                from shipments s
                join order_returns r on r.order_id = s.order_id
                where r.id = ${movement.referenceId}::uuid
                  and r.organization_id = ${organizationId}::uuid
                  and s.voided_at is null
              `,
            )
          : null;

      return (
        shipped ??
        (await atPoolAverage(tx, poolId, movement.quantity)) ??
        unvalued(null)
      );
    }

    default: {
      // An inbound adjustment. A voided shipment's reversal comes back at
      // the cost it left at; found stock rides at its pool's average, since
      // it was bought at the price its pool already carries.
      const reversed =
        movement.referenceType === 'shipment' && movement.referenceId
          ? await shippedAt(
              tx,
              organizationId,
              movement,
              sql`select ${movement.referenceId}::uuid`,
            )
          : null;

      return (
        reversed ??
        (await atPoolAverage(tx, poolId, movement.quantity)) ??
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
 * "Today" is the database's calendar day, which is UTC; a receipt at 5pm in
 * Vancouver reads tomorrow's rate if one was entered early. Movements have
 * no calendar-day column to use instead (#20).
 */
async function purchased(
  tx: Tx,
  organizationId: string,
  quantity: string,
  cost: PurchaseCost,
): Promise<Valued> {
  // Plain SQL with every table aliased, so the correlated subquery cannot
  // bind a bare column to the wrong table.
  const found = await tx.execute(sql`
    select o.base_currency as base,
           (select r.rate
              from exchange_rates r
             where r.organization_id = o.id
               and r.currency = ${cost.currency}
               and r.rate_date <= current_date
             order by r.rate_date desc
             limit 1) as rate
    from organizations o
    where o.id = ${organizationId}::uuid
  `);

  const { base, rate } = found.rows[0] as {
    base: string | null;
    rate: string | null;
  };

  if (!base) return unvalued(cost);

  const applied = cost.currency === base ? null : rate;

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
 * The unit cost at which this pool's stock left on the given shipments,
 * applied to what is coming back. Null when none of it was valued — a
 * shipment from before valuation began.
 */
async function shippedAt(
  tx: Tx,
  organizationId: string,
  movement: Movement,
  shipmentIds: SQL,
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
      and v.lot_id is not distinct from ${movement.lotId}::uuid
      and m.reason = 'shipment'
      and m.reference_type = 'shipment'
      and m.reference_id in (${shipmentIds})
    having sum(v.quantity) <> 0
  `);

  const [row] = result.rows as { value: string }[];
  return row ? derived(row.value) : null;
}

/** The pool's current unit cost, or null for an empty pool. */
async function atPoolAverage(
  tx: Tx,
  poolId: string,
  quantity: string,
): Promise<Valued | null> {
  const result = await tx.execute(sql`
    select round(${quantity}::numeric * value / quantity, 6) as value
    from valuation_pools
    where id = ${poolId}::uuid
      and quantity > 0
  `);

  const [row] = result.rows as { value: string }[];
  return row ? derived(row.value) : null;
}
