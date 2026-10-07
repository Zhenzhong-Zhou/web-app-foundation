/**
 * A quantity for a sentence a person reads, a notification's: "30", not
 * "30.0000", as the screens show it (ADR-055).
 *
 * Trimmed as text, never parsed (ADR-025): numeric(18,4) arrives as a
 * string, and the trailing zeros after its point are all that goes. Grouping
 * and the decimal comma are the screens' to add; a notification is written
 * before anyone reads it.
 */
export function readableQuantity(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '');
}
