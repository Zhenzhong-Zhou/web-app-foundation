import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { type SQL, sql } from 'drizzle-orm';

import { dayIn } from '../../common/today';
import { recordPrevious } from '../../core/audit/audit-context';
import { timeZoneOf } from '../../core/organizations/time-zone';
import { t, type Translatable } from '../../i18n/translate';
import { baseCurrency, rateOnOrBefore } from './rates';
import type { Tx } from './stock.service';
import { AT_POOL_AVERAGE, lockPool, lockPools } from './valuation';

/**
 * Value that arrives after the stock did (ADR-048): a batch's cost at its
 * run's close, and a cost set or corrected after the receipt.
 *
 * Both spread the same way (spread): each unit of the acquisition carries its
 * share once, in time order (ADR-094's amendment, #678, #677). The share for
 * units moved since to another lot follows them there (ADR-094, D5); the
 * share for units still in the pool revalues the pool; the share for units
 * already gone is an `issued` row, recorded against the pool's history and
 * kept out of its balance. None flows on into anything those gone units
 * became — propagating through production is an open decision.
 */

/** One code's value arriving late, and who gave it. */
interface Late {
  organizationId: string;
  variantId: string;
  kind: 'run_close' | 'correction';
  actorId: string;
}

/** The acquisition a late value belongs to, in one pool. */
interface Acquisition {
  /** The pool's lot; null for an item without lots. */
  lotId: string | null;
  /** Its value rows in the pool's history: a condition on `h`. */
  rows: SQL;
  /** How many units it brought, in all. */
  quantity: string;
  /** The late value, signed: what it is worth more, or less. */
  value: string;
}

/** The row the late value arrives on in the pool, and what it names. */
interface Arriving {
  referenceType: 'production_order' | 'stock_valuation';
  referenceId: string;
  unitPrice?: string | null;
  currency?: string | null;
  exchangeRate?: string | null;
}

/** What a late value came to in one pool it reached by a lot change. */
interface Followed {
  lotId: string;
  held: string;
  issued: string;
}

interface Spread {
  /** The change to stock still in the first pool. */
  held: string;
  /** The change recorded against stock already gone from it. */
  issued: string;
  /** Each pool it followed stock moved to, in the order reached. */
  followed: Followed[];
}

/** One lot change the walk found carrying part of the value. */
interface Carried {
  part: 'move';
  in_id: string;
  to_lot_id: string;
  moved: string;
  carried: string;
}

/** What of the value stays with the stock in the pool, and what went. */
interface Rest {
  part: 'rest';
  held: string;
  issued: string;
}

/** The pools a late value may reach. */
interface Reach {
  /** Each pool's id by its lot, locked in lot order. */
  pools: Map<string | null, string>;
}

/** What a late value comes to in one pool, worked out before it is written. */
interface Plan {
  acquisition: Acquisition;
  arriving: Arriving;
  poolId: string;
  /** The change to stock still in the pool. */
  held: string;
  /** The change recorded against stock already gone from it. */
  issued: string;
  /** Each lot change that carried a part, and what that part comes to. */
  moves: { carried: Carried; hop: Plan }[];
}

/** A pool's lot, as a condition its index can serve. */
function lotIs(column: SQL, lotId: string | null): SQL {
  return lotId === null
    ? sql`${column} is null`
    : sql`${column} = ${lotId}::uuid`;
}

/**
 * Locks every pool a late value may reach, in lot order (inLotOrder), after
 * the code's row: the acquisition's, and each lot it can reach by lot changes
 * out of a pool after the stock that would carry it arrived there. A move
 * takes its two pools in the same order, so a cost and a move at once never
 * each hold one the other waits for. A lot change committed while the locks
 * were taken is found by the walk, which locks its pool then.
 */
async function lockReach(
  tx: Tx,
  late: Late,
  starts: { lotId: string | null; after: string }[],
): Promise<Reach> {
  const found = await tx.execute(sql`
    with recursive reach (lot_id, after_id) as (
      select s.lot_id, s.after_id
      from (
        values ${sql.join(
          starts.map(
            (start) => sql`(${start.lotId}::uuid, ${start.after}::uuid)`,
          ),
          sql`, `,
        )}
      ) as s(lot_id, after_id)
      union
      select i.lot_id, i.id
      from reach r
      join stock_valuations o
        on o.organization_id = ${late.organizationId}::uuid
       and o.variant_id = ${late.variantId}::uuid
       and o.lot_id is not distinct from r.lot_id
       and o.kind = 'lot_change'
       and o.quantity < 0
       and o.id > r.after_id
      join stock_valuations i
        on i.organization_id = ${late.organizationId}::uuid
       and i.movement_id = o.movement_id
       and i.kind = 'lot_change'
       and i.quantity > 0
    )
    select distinct lot_id from reach
  `);

  const pools = await lockPools(
    tx,
    late.organizationId,
    late.variantId,
    (found.rows as { lot_id: string | null }[]).map((row) => row.lot_id),
  );
  return { pools };
}

/**
 * Spreads a late value over what became of its acquisition's units in one
 * pool (ADR-048; ADR-094, D5), and writes it: worked out first (plan), then
 * written (write), each pool's rows in the order they always were.
 */
async function spread(
  tx: Tx,
  late: Late,
  reach: Reach,
  acquisition: Acquisition,
  arriving: Arriving,
): Promise<Spread> {
  return write(tx, late, await plan(tx, late, reach, acquisition, arriving));
}

/**
 * Works out what a late value comes to in one pool, and in each pool it
 * follows stock to, before anything is written (ADR-094's amendment, "A late
 * cost follows each unit once").
 *
 * The walk takes the pool's rows in time order from the acquisition's first,
 * keeping how many of the acquisition's units the pool still holds. Each row
 * out takes them in proportion: its quantity times those units, over what
 * the pool held just before; the last unit out takes what is left. A row in
 * dilutes them, all but the acquisition's own rows, which add their units,
 * and a row that brings back stock a shipment took: an order's return, from
 * the order's shipments from the lot, or a voided shipment's reversal, from
 * the shipment it names, as shippedAt (valuation.ts) finds them. It takes
 * back the units the shipment took, times the quantity coming back over the
 * quantity shipped, so they are in the pool again, and their share is not
 * issued. A return whose shipment took none, and a "Returned" receipt with
 * no order, bring nothing back. Once the pool holds none of the units and
 * no later row can bring any back, the walk stops.
 *
 * What a row out took goes where its stock went: a lot change's to its row
 * in, where the walk goes on (a hop, in that pool, the row in its
 * acquisition); any other row's to `issued`. Stock back by a later lot
 * change is a later row in, so it carries only what its own units carry and
 * a unit is never counted twice (#678). What the pool still holds is its
 * share and never more (#677). Units are kept to twelve places, each taken
 * exactly from what is left, so the parts add up to the acquisition.
 *
 * The value splits by those units, rounded to six places on the running
 * total, so the parts add up to it to the millionth: each lot change that
 * carried a part, in time order, then what is held, then what is issued,
 * the last, taking the remainder.
 */
async function plan(
  tx: Tx,
  late: Late,
  reach: Reach,
  acquisition: Acquisition,
  arriving: Arriving,
): Promise<Plan> {
  const { organizationId, variantId } = late;
  const poolId =
    reach.pools.get(acquisition.lotId) ??
    (await lockPool(tx, organizationId, variantId, acquisition.lotId));
  reach.pools.set(acquisition.lotId, poolId);

  const quantity = sql`${acquisition.quantity}::numeric`;
  const value = sql`${acquisition.value}::numeric`;
  const walked = await tx.execute(sql`
    with recursive ledger as (
      select h.id, h.kind, h.quantity, h.movement_id,
             (${acquisition.rows}) as acquired,
             coalesce(sum(h.quantity) over earlier, 0) as before
      from stock_valuations h
      where h.organization_id = ${organizationId}::uuid
        and h.variant_id = ${variantId}::uuid
        and ${lotIs(sql`h.lot_id`, acquisition.lotId)}
      window earlier as (
        order by h.id rows between unbounded preceding and 1 preceding
      )
    ),
    history as (
      select l.id, l.kind, l.quantity, l.movement_id, l.acquired, l.before,
             row_number() over (order by l.id) as n
      from ledger l
      where l.quantity <> 0
        and l.id >= (
          select f.id from ledger f where f.acquired order by f.id limit 1
        )
    ),
    -- Rows in that bring back stock a shipment took, and the shipments'
    -- rows in this pool before them: those that may bring units back.
    reversals as (
      select r.id, m.reason, m.reference_type, m.reference_id
      from history r
      join stock_movements m
        on m.organization_id = ${organizationId}::uuid
       and m.id = r.movement_id
      where r.kind = 'movement'
        and r.quantity > 0
        and (
          (m.reason = 'return' and m.reference_type = 'order_return')
          or m.reference_type = 'shipment'
        )
    ),
    backs as (
      select r.id, array_agg(s.id) as shipments, -sum(s.quantity) as shipped
      from reversals r
      cross join lateral (
        select sh.id
        from order_returns o
        join shipments sh
          on sh.organization_id = ${organizationId}::uuid
         and sh.order_id = o.order_id
         and sh.voided_at is null
        where r.reference_type = 'order_return'
          and o.organization_id = ${organizationId}::uuid
          and o.id = r.reference_id
        union all
        select r.reference_id
        where r.reference_type = 'shipment'
      ) reversed
      join stock_movements sm
        on sm.organization_id = ${organizationId}::uuid
       and sm.variant_id = ${variantId}::uuid
       and sm.reason = 'shipment'
       and sm.reference_type = 'shipment'
       and sm.reference_id = reversed.id
      join stock_valuations s
        on s.organization_id = ${organizationId}::uuid
       and s.movement_id = sm.id
       and s.kind = 'movement'
       and s.variant_id = ${variantId}::uuid
       and ${lotIs(sql`s.lot_id`, acquisition.lotId)}
       and s.id < r.id
      group by r.id
    ),
    steps as (
      select h.n, h.id, h.quantity, h.acquired, h.before,
             b.shipments, b.shipped,
             exists (
               select 1 from backs bb where h.id = any (bb.shipments)
             ) as watched,
             i.id as in_id, i.lot_id as to_lot_id,
             max(case when h.acquired or b.id is not null then h.n end)
               over () as needed
      from history h
      left join backs b on b.id = h.id
      left join stock_valuations i
        on h.kind = 'lot_change'
       and h.quantity < 0
       and i.organization_id = ${organizationId}::uuid
       and i.movement_id = h.movement_id
       and i.kind = 'lot_change'
       and i.quantity > 0
    ),
    -- The acquisition's units in the pool after each row, and what each
    -- shipment a later row brings back took of them.
    walk (n, units, took, change) as (
      select 0::bigint, 0::numeric, '{}'::jsonb, 0::numeric
      union all
      select k.n, w.units + d.change,
             case
               when k.watched
                 then w.took || jsonb_build_object(k.id::text, -d.change)
               else w.took
             end,
             d.change
      from walk w
      join steps k on k.n = w.n + 1
      cross join lateral (
        select case
                 when k.acquired then k.quantity
                 when k.quantity > 0 and k.shipped > 0 then
                   round(
                     k.quantity * (
                       select coalesce(sum((w.took ->> t.id::text)::numeric), 0)
                       from unnest(k.shipments) as t(id)
                     ) / k.shipped,
                     12
                   )
                 when k.quantity > 0 then 0
                 when k.before + k.quantity <= 0 then -w.units
                 else greatest(
                   round(k.quantity * w.units / k.before, 12),
                   -w.units
                 )
               end as change
      ) d
      where w.units <> 0 or k.n <= k.needed
    ),
    ended as (
      select w.units from walk w order by w.n desc limit 1
    ),
    moved as (
      select k.n, k.in_id, k.to_lot_id, -k.quantity as moved,
             -w.change as units
      from walk w
      join steps k on k.n = w.n
      where k.in_id is not null
        and w.change <> 0
    ),
    parts as (
      select 0 as rank, m.n, m.in_id, m.to_lot_id, m.moved, m.units
      from moved m
      union all
      select 1, null, null, null, null, e.units
      from ended e
      union all
      select 2, null, null, null, null,
             ${quantity} - e.units
               - coalesce((select sum(m.units) from moved m), 0)
      from ended e
    ),
    valued as (
      select p.rank, p.n, p.in_id, p.to_lot_id, p.moved,
             round(${value} * sum(p.units) over upto / ${quantity}, 6)
               - round(
                   ${value} * coalesce(sum(p.units) over earlier, 0)
                     / ${quantity},
                   6
                 ) as value
      from parts p
      window upto as (order by p.rank, p.n rows unbounded preceding),
             earlier as (
               order by p.rank, p.n
               rows between unbounded preceding and 1 preceding
             )
    )
    select 'move' as part, v.n, v.in_id, v.to_lot_id, v.moved,
           v.value as carried, null::numeric as held, null::numeric as issued
    from valued v
    where v.rank = 0
      and v.value <> 0
    union all
    select 'rest', null, null, null, null, null,
           max(v.value) filter (where v.rank = 1),
           max(v.value) filter (where v.rank = 2)
    from valued v
    order by n nulls last
  `);

  const rows = walked.rows as unknown as (Carried | Rest)[];
  const rest = rows.find((row): row is Rest => row.part === 'rest')!;

  const moves: Plan['moves'] = [];
  for (const carried of rows) {
    if (carried.part !== 'move') continue;
    moves.push({
      carried,
      hop: await plan(
        tx,
        late,
        reach,
        {
          lotId: carried.to_lot_id,
          rows: sql`h.id = ${carried.in_id}::uuid`,
          quantity: carried.moved,
          value: carried.carried,
        },
        { referenceType: 'stock_valuation', referenceId: carried.in_id },
      ),
    });
  }

  return {
    acquisition,
    arriving,
    poolId,
    held: rest.held,
    issued: rest.issued,
    moves,
  };
}

/**
 * Writes what plan worked out. The rows: one arriving with the value less
 * what is issued, `arriving`'s reference on it, always, as it is also what
 * clears a needs-cost flag; the issued part, if any; and for each lot change
 * that carried a part, a row out of this pool for it, naming that change's
 * row in, whose own pool's arriving row names the same row in. So each
 * pool's history adds up and says where the rest went, the part carried is
 * never `issued`, and only the rows naming the acquisition itself are what
 * it carries in all. Arithmetic stays in Postgres (ADR-025).
 */
async function write(tx: Tx, late: Late, plan: Plan): Promise<Spread> {
  const { organizationId, variantId } = late;
  const { acquisition, arriving, poolId } = plan;

  // The pool takes what stays in it: the value, less what moved on and
  // what had gone.
  await tx.execute(sql`
    update valuation_pools
    set value = value + ${plan.held}::numeric
    where id = ${poolId}::uuid
  `);

  await tx.execute(sql`
    insert into stock_valuations
      (organization_id, variant_id, lot_id, kind, quantity, value,
       unit_price, currency, exchange_rate, reference_type, reference_id,
       actor_id)
    values (
      ${organizationId}::uuid, ${variantId}::uuid,
      ${acquisition.lotId}::uuid, ${late.kind}, 0,
      ${acquisition.value}::numeric - ${plan.issued}::numeric,
      ${arriving.unitPrice ?? null}::numeric, ${arriving.currency ?? null},
      ${arriving.exchangeRate ?? null}::numeric, ${arriving.referenceType},
      ${arriving.referenceId}::uuid, ${late.actorId}::uuid
    )
  `);

  await tx.execute(sql`
    insert into stock_valuations
      (organization_id, variant_id, lot_id, kind, quantity, value,
       reference_type, reference_id, actor_id)
    select
      ${organizationId}::uuid, ${variantId}::uuid,
      ${acquisition.lotId}::uuid, 'issued', 0, ${plan.issued}::numeric,
      ${arriving.referenceType}, ${arriving.referenceId}::uuid,
      ${late.actorId}::uuid
    where ${plan.issued}::numeric <> 0
  `);

  const followed: Followed[] = [];
  for (const { carried, hop } of plan.moves) {
    await tx.execute(sql`
      insert into stock_valuations
        (organization_id, variant_id, lot_id, kind, quantity, value,
         reference_type, reference_id, actor_id)
      values (
        ${organizationId}::uuid, ${variantId}::uuid,
        ${acquisition.lotId}::uuid, ${late.kind}, 0,
        -${carried.carried}::numeric, 'stock_valuation',
        ${carried.in_id}::uuid, ${late.actorId}::uuid
      )
    `);

    const spent = await write(tx, late, hop);
    followed.push(
      { lotId: carried.to_lot_id, held: spent.held, issued: spent.issued },
      ...spent.followed,
    );
  }

  return { held: plan.held, issued: plan.issued, followed };
}

/** The lot a late value followed stock to, and what of it ended there. */
interface FollowedLot {
  lotId: string;
  lotCode: string;
  value: string;
}

/**
 * What a late value came to, lot by lot: in the acquisition's own lot, held
 * and issued, stock moved back into it included; and each other lot it
 * followed stock to, once, in the order first reached, with what of it ended
 * there, held or gone. A lot it only passed through, all of its part moving
 * on, is left out.
 */
async function byLotFollowed(
  tx: Tx,
  organizationId: string,
  lotId: string | null,
  spent: Spread,
): Promise<Pick<CorrectedCost, 'held' | 'issued' | 'followed'>> {
  // Nothing followed stock to another lot: the first pool's parts as they
  // are, with no read (review 64).
  if (spent.followed.length === 0) {
    return { held: spent.held, issued: spent.issued, followed: [] };
  }

  const parts = [{ lotId, held: spent.held, issued: spent.issued }].concat(
    spent.followed,
  );

  const found = await tx.execute(sql`
    select e.lot_id is not distinct from ${lotId}::uuid as own,
           e.lot_id, l.code as lot_code,
           sum(e.held) as held, sum(e.issued) as issued,
           sum(e.held + e.issued) as value
    from (
      values ${sql.join(
        parts.map(
          (part, n) =>
            sql`(${part.lotId}::uuid, ${part.held}::numeric, ${part.issued}::numeric, ${n}::integer)`,
        ),
        sql`, `,
      )}
    ) as e(lot_id, held, issued, n)
    left join lots l
      on l.id = e.lot_id
     and l.organization_id = ${organizationId}::uuid
    group by e.lot_id, l.code
    having e.lot_id is not distinct from ${lotId}::uuid
        or sum(e.held + e.issued) <> 0
    order by min(e.n)
  `);

  const rows = found.rows as {
    own: boolean;
    lot_id: string;
    lot_code: string;
    held: string;
    issued: string;
    value: string;
  }[];
  const own = rows.find((row) => row.own)!;

  return {
    held: own.held,
    issued: own.issued,
    followed: rows
      .filter((row) => !row.own)
      .map((row) => ({
        lotId: row.lot_id,
        lotCode: row.lot_code,
        value: row.value,
      })),
  };
}

/**
 * Holds the code's row `for share`, as every movement does (recordWithin),
 * before the lot of its value rows is read: the start of its lot tracking
 * relabels them, taking the row `for update`, so a cost posted meanwhile
 * waits for it, or it for the cost, and never reads a lot since changed
 * (ADR-094).
 */
async function holdCode(
  tx: Tx,
  organizationId: string,
  variantId: SQL,
): Promise<void> {
  await tx.execute(sql`
    select 1
    from product_variants pv
    where pv.organization_id = ${organizationId}::uuid
      and pv.id = (${variantId})
    for share
  `);
}

/**
 * A batch's material cost, posted to its output at close (ADR-048).
 *
 * Called by `ProductionCloseService.close` after the consumption movements
 * are written, in the same transaction, so what the run consumed is already
 * valued at its pools' averages. The material cost is minus their sum; each
 * output lot takes its share by quantity, the last taking whatever rounding
 * left so the shares add up to the cost exactly. The output's lot is its
 * value row's, never its movement's: output made before the code's lot
 * tracking started was recorded with no lot, and its value row has since
 * taken the lot its stock went into (ADR-094, Q2a).
 *
 * Each output lot's share spreads as a cost set later does (spread): the
 * part of it whose stock moved to another lot before the close follows it
 * there (ADR-094, D5), the output's value rows in the lot its acquisition.
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
  await holdCode(
    tx,
    organizationId,
    sql`select po.output_variant_id
        from production_orders po
        where po.id = ${runId}::uuid
          and po.organization_id = ${organizationId}::uuid`,
  );

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
      select v.variant_id, v.lot_id, sum(m.quantity) as quantity,
             array_agg(v.id::text order by v.id) as valuation_ids
      from stock_movements m
      join stock_valuations v
        on v.movement_id = m.id
       and v.kind = 'movement'
       and v.organization_id = ${organizationId}::uuid
      where m.organization_id = ${organizationId}::uuid
        and m.reference_type = 'production_order'
        and m.reference_id = ${runId}::uuid
        and m.reason = 'production'
      group by v.variant_id, v.lot_id
    ),
    ranked as (
      select o.variant_id, o.lot_id, o.quantity, o.valuation_ids, c.material,
             round(c.material * o.quantity / sum(o.quantity) over (), 6)
               as share,
             row_number() over (order by o.variant_id, o.lot_id nulls first)
               as position,
             count(*) over () as total
      from output o
      cross join cost c
    )
    select r.variant_id, r.lot_id, r.quantity, r.valuation_ids,
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
    /** The output's value rows in the lot, oldest first. */
    valuation_ids: string[];
    value: string;
  }[];

  // A run has one output, so one code: every pool its cost may reach,
  // locked once, in lot order.
  const [first] = rows;
  if (!first) return;
  const late: Late = {
    organizationId,
    variantId: first.variant_id,
    kind: 'run_close',
    actorId,
  };
  const reach = await lockReach(
    tx,
    late,
    rows.map((row) => ({ lotId: row.lot_id, after: row.valuation_ids[0] })),
  );

  for (const row of rows) {
    await spread(
      tx,
      late,
      reach,
      {
        lotId: row.lot_id,
        rows: sql`h.id in ${row.valuation_ids}`,
        quantity: row.quantity,
        value: row.value,
      },
      { referenceType: 'production_order', referenceId: runId },
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
  /** The lots the change followed stock moved to (ADR-094, D5). */
  followed: FollowedLot[];
}

/**
 * What a valuation row is, as far as taking a cost goes: enough for
 * `refusalOf`, which the write and the reads that say `takesCost` share.
 */
export interface CostTaker {
  kind: string;
  reason: string | null;
  to_location_id: string | null;
  /** Signed: a lot change's row out is negative. */
  quantity: string;
  /** The row's own flag, never cleared: it waited when written. */
  needs_cost: boolean;
  reference_type: string | null;
  /** A lot change's: the lot its stock left. */
  from_lot_code: string | null;
}

interface Target extends CostTaker {
  id: string;
  variant_id: string;
  lot_id: string | null;
  /**
   * When the stock arrived, in milliseconds since the epoch: a number, not
   * text whose form follows the database's DateStyle. Its day is the
   * organization's.
   */
  arrived_ms: number;
}

/**
 * Only an acquisition takes a cost. Everything else is valued from something
 * that already has one, and the message says what. So too the stock a lot
 * change moved in, waiting or not (ADR-094, D5), from another lot or from
 * before the code's lot tracking started: the cost its first pool waited
 * for, or any given there later, follows it (spread), so a second one typed
 * on it could only disagree. A return with no shipped cost is one (#661):
 * it waited, or landed at its pool's average, marked so.
 *
 * Null for a row that takes a cost; otherwise why not, the refusal's words.
 */
function refusalOf(target: CostTaker): Translatable | null {
  if (target.kind === 'opening') return null;

  if (target.kind === 'lot_change') {
    if (target.quantity.startsWith('-')) {
      return t({
        id: 'stock.stockGoingOutValued',
        defaultMessage:
          'Stock going out is valued at its pool’s average. Set the cost of what came in instead.',
      });
    }
    if (target.from_lot_code !== null) {
      return t(
        {
          id: 'stock.stockMovedInFromLot',
          defaultMessage:
            'This stock was moved in from lot {code}. Give the cost there and it follows.',
        },
        { code: target.from_lot_code },
      );
    }
    // Come back from before the code's lot tracking started (ADR-094,
    // Q3a): what it waits for is the cost of the delivery it came from,
    // which follows it into the lot when given.
    return t({
      id: 'stock.stockBackFromBefore',
      defaultMessage:
        'This stock came back from before lot tracking started. Give the cost of the delivery it came from, and it follows.',
    });
  }

  if (target.kind === 'movement') {
    if (target.reason === 'receipt') return null;
    if (target.reason === 'adjustment' && target.to_location_id) return null;

    if (target.reason === 'production') {
      return t({
        id: 'stock.batchSCostComes',
        defaultMessage:
          'A batch’s cost comes from its run, when the run closes',
      });
    }

    if (target.reason === 'return') {
      // With no cost it shipped at (#661): it waited, or took its pool's
      // average, and either takes a cost on its own row.
      if (target.needs_cost || target.reference_type === AT_POOL_AVERAGE) {
        return null;
      }
      return t({
        id: 'stock.returnComesBackCost',
        defaultMessage: 'A return comes back at the cost it shipped at',
      });
    }

    return t({
      id: 'stock.stockGoingOutValued',
      defaultMessage:
        'Stock going out is valued at its pool’s average. Set the cost of what came in instead.',
    });
  }

  return t({
    id: 'stock.receiptInboundAdjustmentOpening',
    defaultMessage:
      'Only a receipt, an inbound adjustment or an opening balance takes a cost',
  });
}

/**
 * Whether Set cost takes a cost on this row (#669's 58): the server says,
 * so no screen keeps a copy of the rule.
 */
export function takesCost(row: CostTaker): boolean {
  return refusalOf(row) === null;
}

function assertAcquisition(target: Target): void {
  const refusal = refusalOf(target);
  if (refusal) throw new ConflictException(refusal);
}

/**
 * Sets or corrects what one acquisition cost (ADR-048).
 *
 * The difference between the new total and what the acquisition carries now
 * — its own row plus every earlier correction of it — spreads over what
 * became of its units (spread): moved to another lot, still in the pool, or
 * already gone. A rate not given is the latest on file on or before the day
 * the stock arrived.
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
  await holdCode(
    tx,
    organizationId,
    sql`select v.variant_id
        from stock_valuations v
        where v.id = ${valuationId}::uuid
          and v.organization_id = ${organizationId}::uuid`,
  );

  const found = await tx.execute(sql`
    select v.id, v.kind, v.variant_id, v.lot_id,
           (extract(epoch from v.created_at) * 1000)::float8 as arrived_ms,
           m.reason, m.to_location_id, v.quantity, v.needs_cost,
           v.reference_type, fl.code as from_lot_code
    from stock_valuations v
    left join stock_movements m on m.id = v.movement_id
    left join lots fl
      on fl.id = m.lot_id
     and fl.organization_id = ${organizationId}::uuid
     and v.kind = 'lot_change'
    where v.id = ${valuationId}::uuid
      and v.organization_id = ${organizationId}::uuid
  `);

  const [target] = found.rows as unknown as Target[];

  if (!target)
    throw new NotFoundException(
      t({ id: 'stock.suchValuation', defaultMessage: 'No such valuation' }),
    );

  assertAcquisition(target);

  // The day it arrived where the organization is (ADR-072): stock received
  // at 5 pm in Vancouver arrived that day, not the next.
  const day = dayIn(
    await timeZoneOf(tx, organizationId),
    new Date(target.arrived_ms),
  );

  const base = await baseCurrency(tx, organizationId);

  if (!base) {
    throw new ConflictException(
      t({
        id: 'stock.setBaseCurrencyOrganization',
        defaultMessage:
          'Set a base currency for the organization before costing stock',
      }),
    );
  }

  let rate: string | null = null;

  if (input.currency === base) {
    if (input.exchangeRate !== undefined) {
      throw new BadRequestException(
        t(
          {
            id: 'stock.baseBaseCurrencySo',
            defaultMessage:
              '{base} is the base currency, so a price in it takes no rate',
          },
          { base },
        ),
      );
    }
  } else if (input.exchangeRate !== undefined) {
    rate = input.exchangeRate;
  } else {
    const onFile = await rateOnOrBefore(
      tx,
      organizationId,
      input.currency,
      sql`${day}::date`,
    );

    if (!onFile) {
      throw new ConflictException(
        t(
          {
            id: 'stock.currencyRateBeforeDay',
            defaultMessage:
              'No {currency} rate on or before {day}. Enter one, or give the rate with the cost.',
          },
          { currency: input.currency, day: day },
        ),
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

  // Before what it carries is read: a second cost given at once waits here,
  // then reads what the first wrote.
  const late: Late = {
    organizationId,
    variantId: target.variant_id,
    kind: 'correction',
    actorId,
  };
  const reach = await lockReach(tx, late, [
    { lotId: target.lot_id, after: valuationId },
  ]);

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

  const spent = await spread(
    tx,
    late,
    reach,
    {
      lotId: target.lot_id,
      rows: sql`h.id = ${valuationId}::uuid`,
      quantity,
      value: delta,
    },
    {
      referenceType: 'stock_valuation',
      referenceId: valuationId,
      unitPrice: input.unitPrice,
      currency: input.currency,
      exchangeRate: rate,
    },
  );

  return {
    valuationId,
    value: new_value,
    ...(await byLotFollowed(tx, organizationId, target.lot_id, spent)),
  };
}
