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
 * "10 Oct 2026" for a calendar day — an expiry, an expected delivery, a
 * licence's dates, an invoice date. The API sends and takes these as
 * YYYY-MM-DD (ADR-052), so a form sends the date input's value as typed and
 * prefills from the value as it arrives.
 *
 * Read in UTC on purpose. `new Date('2026-10-10')` is midnight UTC, and read
 * in the browser's zone — as formatDate does — anywhere west of Greenwich
 * that is still 9 Oct: how a lot expiring 10 Oct once showed as 9 Oct in
 * Vancouver. In UTC the day comes back exactly, wherever the browser is.
 *
 * Also reads the full instants audit rows written before ADR-052 still hold,
 * which were stored as UTC midnight of the day picked.
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

/**
 * A unit cost, with the places a currency's minor units would hide: a
 * capsule at 0.0123 is not 0.01. Up to four, never fewer than the currency's
 * own. Display only, as formatMoney is.
 */
export function formatUnitCost(
  amount: string | null,
  currency: string | null,
): string {
  if (amount === null) return '—';
  if (!currency) return amount;

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 4,
  }).format(Number(amount));
}

/** "Focus (60ct)", or "Focus" when the variant has no name — the server's itemName rule. */
export function itemName(
  productName: string,
  variantName: string | null,
): string {
  return variantName ? `${productName} (${variantName})` : productName;
}
