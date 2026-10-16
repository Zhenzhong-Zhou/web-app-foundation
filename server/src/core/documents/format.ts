import { readableQuantity } from '../../common/readable-quantity';

/**
 * Numbers, dates and money as a printed document writes them (ADR-054):
 * once, in its first language's way, from the stored strings, so nothing
 * is rounded on the way to paper (ADR-025).
 */

/** Where a value is missing, as the print pages had it. */
export const NO_VALUE = '\u2014';

/** Built once per language and currency, then reused: a sheet asks often. */
const cache = new Map<string, unknown>();

function cached<T>(key: string, build: () => T): T {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key) as T;
}

/**
 * An amount in its currency's minor units. Formatted from the string
 * itself, never a Number(), which would round a figure past fifteen digits
 * (ADR-025).
 */
export function formatMoney(
  amount: string | null,
  currency: string,
  tag: string,
): string {
  if (amount === null) return NO_VALUE;
  return cached(
    `money\u0000${tag}\u0000${currency}`,
    () => new Intl.NumberFormat(tag, { style: 'currency', currency }),
  ).format(amount as Intl.StringNumericLiteral);
}

/**
 * A unit price, with the places a currency's minor units would hide: a
 * capsule at 0.0123 is not 0.01. Up to four, never fewer than the
 * currency's own, as the client's formatUnitCost writes it.
 */
export function formatUnitPrice(
  amount: string | null,
  currency: string,
  tag: string,
): string {
  if (amount === null) return NO_VALUE;
  return cached(
    `unit\u0000${tag}\u0000${currency}`,
    () =>
      new Intl.NumberFormat(tag, {
        style: 'currency',
        currency,
        maximumFractionDigits: 4,
      }),
  ).format(amount as Intl.StringNumericLiteral);
}

/** A calendar day, read in UTC, so a stored date never moves a day. */
export function formatDay(value: string | Date, tag: string): string {
  return cached(
    `day\u0000${tag}`,
    () =>
      new Intl.DateTimeFormat(tag, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
  ).format(new Date(value));
}

/**
 * A quantity or a rate as read: no padding zeros, the language's decimal
 * mark. "600.0000" reads "600", "9.9750" "9,975" in French. String work,
 * not a number, so nothing is rounded.
 */
export function formatQuantity(value: string, tag: string): string {
  const trimmed = readableQuantity(value);
  const decimal = cached(
    `decimal\u0000${tag}`,
    () =>
      new Intl.NumberFormat(tag)
        .formatToParts(1.5)
        .find((part) => part.type === 'decimal')?.value ?? '.',
  );
  return decimal === '.' ? trimmed : trimmed.replace('.', decimal);
}
