/**
 * Digits after the point in a currency's minor unit: 2 for CAD, 0 for JPY,
 * 3 for KWD. From Intl, the same source the client formats with, so there
 * is no table of currencies to keep current (ADR-046).
 */
export function minorUnits(currency: string): number {
  return (
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

/**
 * An amount for an export's column (asMoney): at its currency's places,
 * never fewer and never rounded (ADR-093, 99a). The padding zeros of
 * numeric's scale go down to the currency's minor units, `12.5000` CAD
 * `12.50` and yen's `1250.0000` `1250`; a digit past them stays, a unit
 * price of `0.0125` as it is; a figure with fewer places is padded.
 *
 * Trimmed as text, never parsed (ADR-025), a minus kept, and read back
 * from the end as readableQuantity is, never with /0+$/.
 */
export function readableMoney(value: string, currency: string): string {
  const places = minorUnits(currency);
  const point = value.indexOf('.');
  if (point === -1) {
    return places === 0 ? value : `${value}.${'0'.repeat(places)}`;
  }

  let end = value.length;
  while (end > point + 1 + places && value[end - 1] === '0') end -= 1;
  if (end === point + 1) return value.slice(0, point);

  const kept = end - point - 1;
  return value.slice(0, end) + '0'.repeat(Math.max(0, places - kept));
}
