import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { recordPrevious } from '../../core/audit/audit-context';
import { baseCurrency, rateOnOrBefore } from './rates';
import type { Tx } from './stock.service';
import { lockPool } from './valuation';

/**
 * Value that arrives after the stock did (ADR-048): a batch's cost at its
 * run's close, and a cost set or corrected after the receipt.
 *
 * Both split the same way. The share for units still in the pool revalues
 * the pool; the share for units already gone is an `issued` row, recorded
 * against the pool's history and kept out of its balance. Neither flows on
 * into anything those gone units became — propagating through production is
 * an open decision.
 */

interface Split {
  held: string;
  issued: string;
}

/**
 * Splits `value`, which belongs to `quantity` units, between the units still
 * in the pool and those already gone.
 *
 * For a lot that is exact. For stock without lots the units are not told
 * apart, so "still here" is as many as the pool holds, up to `quantity` —
 * the usual weighted-average reading.
 */
async function split(
  tx: Tx,
  poolId: string,
  quantity: string,
  value: string,
): Promise<Split> {
  const result = await tx.execute(sql`
    select s.held, ${value}::numeric - s.held as issued
    from (
      select round(
        ${value}::numeric * least(p.quantity, ${quantity}::numeric)
          / ${quantity}::numeric,
        6
      ) as held
      from valuation_pools p
      where p.id = ${poolId}::uuid
    ) s
  `);

  return result.rows[0] as unknown as Split;
}

interface Posting {
  organizationId: string;
  poolId: string;
  variantId: string;
  lotId: string | null;
  kind: 'run_close' | 'correction';
  referenceType: 'production_order' | 'stock_valuation';
  referenceId: string;
  unitPrice?: string | null;
  currency?: string | null;
  exchangeRate?: string | null;
  actorId: string;
}

/**
 * Writes one split: the held share into the pool and its row, always — the
 * row is also what clears a needs-cost flag — and the issued share only when
 * there is one.
 */
async function post(tx: Tx, posting: Posting, shares: Split): Promise<void> {
  await tx.execute(sql`
    update valuation_pools
    set value = value + ${shares.held}::numeric
    where id = ${posting.poolId}::uuid
  `);

  await tx.execute(sql`
    insert into stock_valuations
      (organization_id, variant_id, lot_id, kind, quantity, value,
       unit_price, currency, exchange_rate, reference_type, reference_id,
       actor_id)
    values (
      ${posting.organizationId}::uuid, ${posting.variantId}::uuid,
      ${posting.lotId}::uuid, ${posting.kind}, 0, ${shares.held}::numeric,
      ${posting.unitPrice ?? null}::numeric, ${posting.currency ?? null},
      ${posting.exchangeRate ?? null}::numeric, ${posting.referenceType},
      ${posting.referenceId}::uuid, ${posting.actorId}::uuid
    )
  `);

  await tx.execute(sql`
    insert into stock_valuations
      (organization_id, variant_id, lot_id, kind, quantity, value,
       reference_type, reference_id, actor_id)
    select
      ${posting.organizationId}::uuid, ${posting.variantId}::uuid,
      ${posting.lotId}::uuid, 'issued', 0, ${shares.issued}::numeric,
      ${posting.referenceType}, ${posting.referenceId}::uuid,
      ${posting.actorId}::uuid
    where ${shares.issued}::numeric <> 0
  `);
}

/**
 * A batch's material cost, posted to its output at close (ADR-048).
 *
 * Called by `ProductionCloseService.close` after the consumption movements
 * are written, in the same transaction, so what the run consumed is already
 * valued at its pools' averages. The material cost is minus their sum; each
 * output lot takes its share by quantity, the last taking whatever rounding
 * left so the shares add up to the cost exactly.
 *
 * A run that produced nothing posts nothing: its material cost is what its
 * consumption rows already say, and there is no unit to carry it.
 */
export async function postRunCost(
  tx: Tx,
  organizationId: string,
  runId: string,
  actorId: string,
): Promise<void> {
  const shares = await tx.execute(sql`
    with cost as (
      select coalesce(-sum(v.value), 0) as material
      from stock_movements m
      join stock_valuations v on v.movement_id = m.id
      where m.organization_id = ${organizationId}::uuid
        and m.reference_type = 'production_order'
        and m.reference_id = ${runId}::uuid
        and m.reason = 'consumption'
    ),
    output as (
      select m.variant_id, m.lot_id, sum(m.quantity) as quantity
      from stock_movements m
      where m.organization_id = ${organizationId}::uuid
        and m.reference_type = 'production_order'
        and m.reference_id = ${runId}::uuid
        and m.reason = 'production'
      group by m.variant_id, m.lot_id
    ),
    ranked as (
      select o.variant_id, o.lot_id, o.quantity, c.material,
             round(c.material * o.quantity / sum(o.quantity) over (), 6)
               as share,
             row_number() over (order by o.variant_id, o.lot_id nulls first)
               as position,
             count(*) over () as total
      from output o
      cross join cost c
    )
    select r.variant_id, r.lot_id, r.quantity,
           case
             when r.position = r.total then
               r.material - coalesce(sum(r.share) over (
                 order by r.position
                 rows between unbounded preceding and 1 preceding
               ), 0)
             else r.share
           end as value
    from ranked r
    order by r.position
  `);

  const rows = shares.rows as {
    variant_id: string;
    lot_id: string | null;
    quantity: string;
    value: string;
  }[];

  for (const row of rows) {
    const poolId = await lockPool(
      tx,
      organizationId,
      row.variant_id,
      row.lot_id,
    );

    await post(
      tx,
      {
        organizationId,
        poolId,
        variantId: row.variant_id,
        lotId: row.lot_id,
        kind: 'run_close',
        referenceType: 'production_order',
        referenceId: runId,
        actorId,
      },
      await split(tx, poolId, row.quantity, row.value),
    );
  }
}

export interface CostInput {
  unitPrice: string;
  currency: string;
  exchangeRate?: string;
}

export interface CorrectedCost {
  valuationId: string;
  /** What the acquisition is now worth in total, in the base currency. */
  value: string;
  /** The change applied to stock still in the pool. */
  held: string;
  /** The change recorded against stock already gone. */
  issued: string;
}

interface Target {
  id: string;
  kind: string;
  variant_id: string;
  lot_id: string | null;
  day: string;
  reason: string | null;
  to_location_id: string | null;
}

/**
 * Only an acquisition takes a cost. Everything else is valued from something
 * that already has one, and the message says what.
 */
function assertAcquisition(target: Target): void {
  if (target.kind === 'opening') return;

  if (target.kind === 'movement') {
    if (target.reason === 'receipt') return;
    if (target.reason === 'adjustment' && target.to_location_id) return;

    if (target.reason === 'production') {
      throw new ConflictException(
        "A batch's cost comes from its run, when the run closes",
      );
    }

    if (target.reason === 'return') {
      throw new ConflictException(
        'A return comes back at the cost it shipped at',
      );
    }

    throw new ConflictException(
      "Stock going out is valued at its pool's average. Set the cost of what came in instead.",
    );
  }

  throw new ConflictException(
    'Only a receipt, an inbound adjustment or an opening balance takes a cost',
  );
}

/**
 * Sets or corrects what one acquisition cost (ADR-048).
 *
 * The difference between the new total and what the acquisition carries now
 * — its own row plus every earlier correction of it — is split between the
 * pool and the units already gone. A rate not given is the latest on file
 * on or before the day the stock arrived.
 *
 * Refusals: 404 for a row that is not this organization's; 409 for a row
 * that is not an acquisition, for no base currency, or for no rate; 400 for
 * a rate on a price already in the base currency.
 */
export async function correctCost(
  tx: Tx,
  organizationId: string,
  valuationId: string,
  input: CostInput,
  actorId: string,
): Promise<CorrectedCost> {
  const found = await tx.execute(sql`
    select v.id, v.kind, v.variant_id, v.lot_id,
           (v.created_at at time zone 'UTC')::date::text as day,
           m.reason, m.to_location_id
    from stock_valuations v
    left join stock_movements m on m.id = v.movement_id
    where v.id = ${valuationId}::uuid
      and v.organization_id = ${organizationId}::uuid
  `);

  const [target] = found.rows as unknown as Target[];

  if (!target) throw new NotFoundException('No such valuation');

  assertAcquisition(target);

  const base = await baseCurrency(tx, organizationId);

  if (!base) {
    throw new ConflictException(
      'Set a base currency for the organization before costing stock',
    );
  }

  let rate: string | null = null;

  if (input.currency === base) {
    if (input.exchangeRate !== undefined) {
      throw new BadRequestException(
        `${base} is the base currency, so a price in it takes no rate`,
      );
    }
  } else if (input.exchangeRate !== undefined) {
    rate = input.exchangeRate;
  } else {
    const onFile = await rateOnOrBefore(
      tx,
      organizationId,
      input.currency,
      sql`${target.day}::date`,
    );

    if (!onFile) {
      throw new ConflictException(
        `No ${input.currency} rate on or before ${target.day}. Enter one, or give the rate with the cost.`,
      );
    }

    rate = onFile;
  }

  // What it cost before this, for the audit row: the latest correction, or
  // the acquisition itself.
  const previous = await tx.execute(sql`
    select c.unit_price, c.currency, c.exchange_rate
    from stock_valuations c
    where c.organization_id = ${organizationId}::uuid
      and (
        c.id = ${valuationId}::uuid
        or (c.kind = 'correction'
            and c.reference_type = 'stock_valuation'
            and c.reference_id = ${valuationId}::uuid)
      )
    order by c.id desc
    limit 1
  `);

  const [was] = previous.rows as {
    unit_price: string | null;
    currency: string | null;
    exchange_rate: string | null;
  }[];

  recordPrevious({
    unitPrice: was?.unit_price ?? null,
    currency: was?.currency ?? null,
    exchangeRate: was?.exchange_rate ?? null,
  });

  const poolId = await lockPool(
    tx,
    organizationId,
    target.variant_id,
    target.lot_id,
  );

  /**
   * One statement, every table aliased: the correlated sum names its outer
   * row in plain SQL, so it cannot bind to its own table.
   */
  const computed = await tx.execute(sql`
    select d.new_value,
           d.new_value - d.old_value as delta,
           d.quantity
    from (
      select
        round(
          t.quantity * ${input.unitPrice}::numeric
            * ${rate ?? '1'}::numeric,
          6
        ) as new_value,
        t.quantity,
        (select coalesce(sum(c.value), 0)
           from stock_valuations c
          where c.organization_id = t.organization_id
            and (c.id = t.id
                 or (c.reference_type = 'stock_valuation'
                     and c.reference_id = t.id))) as old_value
      from stock_valuations t
      where t.id = ${valuationId}::uuid
    ) d
  `);

  const { new_value, delta, quantity } = computed.rows[0] as {
    new_value: string;
    delta: string;
    quantity: string;
  };

  const shares = await split(tx, poolId, quantity, delta);

  await post(
    tx,
    {
      organizationId,
      poolId,
      variantId: target.variant_id,
      lotId: target.lot_id,
      kind: 'correction',
      referenceType: 'stock_valuation',
      referenceId: valuationId,
      unitPrice: input.unitPrice,
      currency: input.currency,
      exchangeRate: rate,
      actorId,
    },
    shares,
  );

  return {
    valuationId,
    value: new_value,
    held: shares.held,
    issued: shares.issued,
  };
}
