/** https://www.postgresql.org/docs/current/errcodes-appendix.html */
const PG_UNIQUE_VIOLATION = '23505';
const PG_CHECK_VIOLATION = '23514';

/**
 * Finds the pg error carrying a given SQLSTATE, anywhere in the cause chain.
 *
 * Drizzle wraps query errors, so the error carrying the code is not the error
 * that reaches a catch block. Walks past anything that does not match rather
 * than stopping at the first object with a `code` — a wrapper that happens to
 * set one must not hide the real error underneath it.
 *
 * Bounded rather than while(true): a malformed cause chain should not hang.
 *
 * Returns the error itself, not a boolean, so callers can read `constraint`.
 */
function findPgError(
  error: unknown,
  code: string,
): { constraint?: string } | null {
  let current: unknown = error;

  for (
    let depth = 0;
    depth < 5 && current !== null && current !== undefined;
    depth += 1
  ) {
    if (
      typeof current === 'object' &&
      'code' in current &&
      (current as { code?: string }).code === code
    ) {
      return current as { constraint?: string };
    }

    current = (current as { cause?: unknown }).cause;
  }

  return null;
}

/**
 * Converts a unique-violation from the database into a 409.
 *
 * Needed because an advisory SELECT cannot be atomic: two simultaneous inserts
 * both pass it, and one then hits the index. Without this the loser gets a 500.
 *
 * Two call sites use this differently. auth and users check for duplicates
 * with an explicit SELECT first and fall back to this only on a race, which is
 * why the wrapping went unnoticed until products needed it. Products relies on
 * it as the sole check, because a SELECT-then-INSERT there would be the same
 * race with an extra query — do not "fix" that by adding one.
 */
export function isUniqueViolation(error: unknown): boolean {
  return findPgError(error, PG_UNIQUE_VIOLATION) !== null;
}

/**
 * Named, because which constraint fired changes the message entirely.
 *
 * stock_levels_quantity_non_negative_check means someone tried to move more
 * than is on the shelf — a 409 the user can act on, not a 500. There is no
 * balance read before the upsert to produce a friendlier message: that read
 * would be a round trip and still not authoritative, since the row is only
 * locked once the upsert runs. The constraint is what makes it correct; this
 * is what makes it readable.
 *
 * Unlike isUniqueViolation, the constraint name is part of the question. A
 * table with several check constraints returns the same SQLSTATE for all of
 * them, and mapping the wrong one to a 409 tells the user something false.
 */
export function isCheckViolation(error: unknown, constraint?: string): boolean {
  const pg = findPgError(error, PG_CHECK_VIOLATION);
  if (!pg) return false;
  return constraint === undefined || pg.constraint === constraint;
}
