import { type SQL, sql } from 'drizzle-orm';

/*
 * A lot's former codes as the answers read them (ADR-094 amended, R9):
 * lot_former_codes, by lot_former_codes_lot_idx, for a statement's own
 * rows. Each takes the lot, and the moment, named in plain SQL, as a
 * correlated subquery's outer row is (database.md), and the organization
 * in its own filter (ADR-003). Searched by lot-search.ts.
 */

/**
 * The code a lot had last before its code today, for "was {code}" under
 * it; null for a lot never corrected.
 */
export function latestFormerCode(
  lotId: SQL,
  organizationId: string,
): SQL<string | null> {
  return sql<string | null>`(
    select f.code from lot_former_codes f
    where f.organization_id = ${organizationId}::uuid
      and f.lot_id = ${lotId}
    order by f.changed_at desc
    limit 1
  )`;
}

/**
 * Every code a lot had, newest first, the codes alone; empty for a lot
 * never corrected. Its code today is none of them, though a lot that
 * took its own former code back once left it (review 84).
 */
export function formerCodesOf(
  lot: { id: SQL; code: SQL },
  organizationId: string,
): SQL<string[]> {
  return sql<string[]>`coalesce((
    select array_agg(f.code order by f.changed_at desc)
    from lot_former_codes f
    where f.organization_id = ${organizationId}::uuid
      and f.lot_id = ${lot.id}
      and f.code <> ${lot.code}
  ), '{}')`;
}

/**
 * The code a lot had at a moment, where it differs from its code today
 * (M1a, E3a): the code the first correction after that moment took away.
 * Null where it had today's code then, so a lot that took its own former
 * code back reads as today's for that time too.
 */
export function codeThen(
  lot: { id: SQL; code: SQL },
  at: SQL,
  organizationId: string,
): SQL<string | null> {
  return sql<string | null>`nullif((
    select f.code from lot_former_codes f
    where f.organization_id = ${organizationId}::uuid
      and f.lot_id = ${lot.id}
      and f.changed_at > ${at}
    order by f.changed_at
    limit 1
  ), ${lot.code})`;
}
