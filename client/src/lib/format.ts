const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60_000],
  ['month', 30 * 24 * 60 * 60_000],
  ['day', 24 * 60 * 60_000],
  ['hour', 60 * 60_000],
  ['minute', 60_000],
];

/**
 * "2 hours ago". Intl rather than a date library — this is the only place a
 * relative time is needed, and adding one for it would cost more than it
 * saves.
 *
 * Note last_seen_at is throttled to one write a minute server-side, so
 * "just now" can be up to a minute stale. Fine for this display.
 */
export function relativeTime(value: string | Date): string {
  const elapsed = new Date(value).getTime() - Date.now();

  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) {
      return RELATIVE.format(Math.round(elapsed / ms), unit);
    }
  }

  return 'just now';
}

const DATE = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/**
 * "12 Sep 2026" for a moment in time — when a run was planned, when a row was
 * created. Absolute rather than relative, unlike relativeTime above, and in
 * the browser's timezone, because a moment happened at a local time.
 *
 * Not for calendar days. Use formatDay for those.
 */
export function formatDate(value: string | Date): string {
  return DATE.format(new Date(value));
}

const DAY = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/**
 * A calendar day — an expiry, an expected delivery — stored as timestamptz.
 *
 * Every form sends the picked day as UTC midnight ("2026-10-10" parses as
 * 2026-10-10T00:00Z), so the day is recovered exactly by reading it back in
 * UTC. formatDate reads it in the browser's zone instead, and anywhere west
 * of Greenwich UTC midnight is still the previous evening: a lot entered as
 * expiring 10 Oct showed as 9 Oct in Vancouver, beside a date field that
 * correctly said 10.
 *
 * The date inputs already agree: they prefill with `.slice(0, 10)`, which is
 * the UTC day. A `date` column would remove the question entirely; until then
 * this is exact, not an approximation, as long as writes keep sending
 * midnight UTC.
 */
export function formatDay(value: string | Date): string {
  return DAY.format(new Date(value));
}

/**
 * A money amount in its own currency.
 *
 * Intl knows each currency's minor units, so JPY renders without decimals and
 * CAD with two — which is why the server returns the number unrounded and
 * leaves this decision here (ADR-035).
 *
 * The amount arrives as a string from numeric(18,4) and is parsed only at the
 * point of display. Nothing computed from it is ever stored.
 */
export function formatMoney(
  amount: string | null,
  currency: string | null,
): string {
  if (amount === null) return '—';
  if (!currency) return amount;

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(Number(amount));
}
