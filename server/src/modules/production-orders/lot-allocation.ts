import { ConflictException } from '@nestjs/common';
import { type SQL, sql } from 'drizzle-orm';

import type { TenantDb } from '../../database/tenant-db.service';

type Tx = Parameters<Parameters<TenantDb['transaction']>[0]>[0];

/** A lot holding stock at a location, and how much of it a request takes. */
export interface LotCandidate {
  lotId: string;
  code: string;
  expiresAt: Date | null;
  /** On hand at the location. A numeric(18,4) string, never a number. */
  onHand: string;
  /** What earliest-expiry-first takes from this lot. '0' when none. */
  take: string;
  taken: boolean;
}

export interface CandidateQuery {
  organizationId: string;
  variantId: string;
  locationId: string;
  /** A positive decimal string. */
  quantity: string;
  /**
   * Only lots that reached this location for this run. Close consumes what
   * was issued to the run, not whatever else happens to share its location
   * (ADR-039).
   */
  fromRunId?: string;
}

/**
 * Earliest expiry first: the order a lot-tracked component leaves a shelf
 * (ADR-039).
 *
 * Sorted by expiry with no-expiry lots last, then by when the lot was first
 * seen, then by id, so two lots with the same date always come out in the same
 * order and a preview matches the release that follows it.
 *
 * All arithmetic is in SQL. A running total over numeric(18,4) is exactly
 * what ADR-025 kept out of JavaScript; `take` is `least(on hand, still
 * needed)` for each lot in turn, computed by the database.
 */
export async function lotCandidates(
  tx: Tx,
  query: CandidateQuery,
): Promise<{ candidates: LotCandidate[]; shortBy: string | null }> {
  const scope = candidateScope(query);

  const rows = await tx.execute(sql`
    with candidates as (${scope}),
    ordered as (
      select
        lot_id, code, expires_at, created_at, quantity,
        coalesce(
          sum(quantity) over (
            order by expires_at asc nulls last, created_at asc, lot_id asc
            rows between unbounded preceding and 1 preceding
          ),
          0
        ) as before
      from candidates
    )
    select
      lot_id,
      code,
      expires_at,
      quantity::text as on_hand,
      greatest(least(quantity, ${query.quantity}::numeric - before), 0)::text as take,
      least(quantity, ${query.quantity}::numeric - before) > 0 as taken
    from ordered
    order by expires_at asc nulls last, created_at asc, lot_id asc
  `);

  const shortfall = await tx.execute(sql`
    with candidates as (${scope})
    select
      greatest(${query.quantity}::numeric - coalesce(sum(quantity), 0), 0)::text as short_by,
      coalesce(sum(quantity), 0) < ${query.quantity}::numeric as short
    from candidates
  `);

  const [summary] = shortfall.rows as { short_by: string; short: boolean }[];

  return {
    candidates: rows.rows.map((row) => ({
      lotId: row.lot_id as string,
      code: row.code as string,
      expiresAt: (row.expires_at as Date | null) ?? null,
      onHand: row.on_hand as string,
      take: row.take as string,
      taken: row.taken as boolean,
    })),
    shortBy: summary.short ? summary.short_by : null,
  };
}

/**
 * The lots to move, earliest expiry first, locked for the rest of the
 * transaction. Throws when the location cannot cover the quantity, naming the
 * component and the gap.
 *
 * Locked before reading, in lot-id order: a window function cannot be
 * combined with FOR UPDATE, and two releases drawing on the same shelf must
 * not both plan to take the same units. Sorting the lock order is the same
 * deadlock rule the stock service follows for transfers.
 */
export async function allocateFefo(
  tx: Tx,
  query: CandidateQuery & { sku: string },
): Promise<{ lotId: string; quantity: string }[]> {
  await tx.execute(sql`
    select 1 from stock_levels
    where organization_id = ${query.organizationId}::uuid
      and variant_id = ${query.variantId}::uuid
      and location_id = ${query.locationId}::uuid
      and lot_id is not null
      and quantity > 0
    order by lot_id
    for update
  `);

  const { candidates, shortBy } = await lotCandidates(tx, query);

  if (shortBy !== null) {
    throw new ConflictException(
      query.fromRunId
        ? `Not enough ${query.sku} was issued to this run to consume ${query.quantity}: ${shortBy} short. Move the missing units to the run's location first.`
        : `Not enough ${query.sku} in lots at that location: ${query.quantity} needed, ${shortBy} short.`,
    );
  }

  return candidates
    .filter((candidate) => candidate.taken)
    .map((candidate) => ({ lotId: candidate.lotId, quantity: candidate.take }));
}

function candidateScope(query: CandidateQuery): SQL {
  const runFilter = query.fromRunId
    ? sql`
        and sl.lot_id in (
          select sm.lot_id from stock_movements sm
          where sm.organization_id = ${query.organizationId}::uuid
            and sm.reference_type = 'production_order'
            and sm.reference_id = ${query.fromRunId}::uuid
            and sm.to_location_id = ${query.locationId}::uuid
            and sm.variant_id = ${query.variantId}::uuid
            and sm.lot_id is not null
        )`
    : sql``;

  return sql`
    select sl.lot_id, sl.quantity, l.code, l.expires_at, l.created_at
    from stock_levels sl
    join lots l on l.id = sl.lot_id
    where sl.organization_id = ${query.organizationId}::uuid
      and sl.variant_id = ${query.variantId}::uuid
      and sl.location_id = ${query.locationId}::uuid
      and sl.quantity > 0
      ${runFilter}
  `;
}
