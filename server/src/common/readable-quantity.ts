/**
 * A quantity for a sentence a person reads, a notification's: "30", not
 * "30.0000", as the screens show it (ADR-055).
 *
 * Trimmed as text, never parsed (ADR-025): numeric(18,4) arrives as a
 * string, and the trailing zeros after its point are all that goes. Grouping
 * and the decimal comma are the screens' to add; a notification is written
 * before anyone reads it.
 *
 * Read back from the end, never with /0+$/, whose time grows with the
 * square of a run of zeros before another digit. The routes' quantities
 * are 19 characters at most, but this is shared, so its time must not rest
 * on each caller's validation.
 */
export function readableQuantity(value: string): string {
  if (!value.includes('.')) return value;

  let end = value.length;
  while (value[end - 1] === '0') end -= 1;
  if (value[end - 1] === '.') end -= 1;

  return value.slice(0, end);
}
