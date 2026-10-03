/**
 * Today, as the server decides it: the UTC calendar day, YYYY-MM-DD
 * (ADR-052).
 *
 * The one place the server answers "what day is it". Licence status at
 * release and the rate a receipt is costed at both ask here, rather than
 * `new Date()` in one and Postgres's `current_date` in the other — which is
 * the database session's day, and so depends on how the database happens to
 * be configured.
 *
 * UTC because an organization has no time zone yet. At 5pm in Vancouver this
 * is already tomorrow; ADR-052 defers an organization's own time zone, and
 * when it comes, this function is what changes.
 *
 * A string rather than a Date: two YYYY-MM-DD strings compare as days, and a
 * `date` column takes one as it is. `now` is a parameter so a test can pin
 * the clock either side of midnight.
 */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
