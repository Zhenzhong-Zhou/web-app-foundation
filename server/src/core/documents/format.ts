/**
 * Numbers, dates and money as a printed document writes them (ADR-054):
 * once, in its first language's way, from the stored strings, so nothing
 * is rounded on the way to paper (ADR-025).
 */

/** Where a value is missing, as the print pages had it. */
export const NO_VALUE = '\u2014';

export function formatMoney(
  amount: string | null,
  currency: string,
  tag: string,
): string {
  if (amount === null) return NO_VALUE;
  return new Intl.NumberFormat(tag, { style: 'currency', currency }).format(
    Number(amount),
  );
}

/** A calendar day, read in UTC, so a stored date never moves a day. */
export function formatDay(value: string | Date, tag: string): string {
  return new Intl.DateTimeFormat(tag, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

/**
 * A quantity or a rate as read: no padding zeros, the language's decimal
 * mark. "600.0000" reads "600", "9.9750" "9,975" in French. String work,
 * not a number, so nothing is rounded.
 */
export function formatQuantity(value: string, tag: string): string {
  const trimmed = value.includes('.') ? value.replace(/\.?0+$/, '') : value;
  const decimal =
    new Intl.NumberFormat(tag)
      .formatToParts(1.5)
      .find((part) => part.type === 'decimal')?.value ?? '.';
  return decimal === '.' ? trimmed : trimmed.replace('.', decimal);
}
