/** 23505 — unique_violation. https://www.postgresql.org/docs/current/errcodes-appendix.html */
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Converts a unique-violation from the database into a 409.
 *
 * Needed because an advisory SELECT cannot be atomic: two simultaneous inserts
 * both pass it, and one then hits the index. Without this the loser gets a 500.
 *
 * Walks the cause chain, because Drizzle wraps query errors — the pg error
 * carrying the code is not the error that reaches a catch block.
 *
 * Two call sites use this differently. auth and users check for duplicates
 * with an explicit SELECT first and fall back to this only on a race, which is
 * why the wrapping went unnoticed until products needed it. Products relies on
 * it as the sole check, because a SELECT-then-INSERT there would be the same
 * race with an extra query — do not "fix" that by adding one.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;

  // Bounded rather than while(true): a malformed cause chain should not hang.
  for (
    let depth = 0;
    depth < 5 && current !== null && current !== undefined;
    depth += 1
  ) {
    if (
      typeof current === 'object' &&
      'code' in current &&
      (current as { code?: string }).code === PG_UNIQUE_VIOLATION
    ) {
      return true;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}
