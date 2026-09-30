import { type SQL, sql } from 'drizzle-orm';

import type { Tx } from './stock.service';

/**
 * The two reads every cost calculation starts from, in one place (ADR-048):
 * what the organization values stock in, and what a foreign currency was
 * worth in it on a given day. Valuation, revaluation, the costs screens and
 * the exchange-rate form each wrote these out, and a rule that changes — a
 * rate's effective day, say — has to change in all of them at once.
 *
 * Plain SQL with every table aliased, like the rest of stock: a bare column
 * inside a subquery built from these would bind to the wrong table.
 */

/** The organization's base currency, or null until one is set. */
export async function baseCurrency(
  tx: Tx,
  organizationId: string,
): Promise<string | null> {
  const result = await tx.execute(sql`
    select o.base_currency as base
    from organizations o
    where o.id = ${organizationId}::uuid
  `);

  return (result.rows[0] as { base: string | null } | undefined)?.base ?? null;
}

/**
 * The latest rate for `currency` on or before `day`, or null when none is on
 * file. `day` is SQL so each caller says which day it means: a receipt costed
 * as it arrives uses `current_date`, a correction uses the day the stock
 * arrived.
 */
export async function rateOnOrBefore(
  tx: Tx,
  organizationId: string,
  currency: string,
  day: SQL,
): Promise<string | null> {
  const result = await tx.execute(sql`
    select r.rate
    from exchange_rates r
    where r.organization_id = ${organizationId}::uuid
      and r.currency = ${currency}
      and r.rate_date <= ${day}
    order by r.rate_date desc
    limit 1
  `);

  return (result.rows[0] as { rate: string } | undefined)?.rate ?? null;
}
