/**
 * Quantities as the API sends them, numeric(18,4) strings, compared exactly.
 *
 * The concurrency check asks whether stock went down by exactly what was
 * shipped. Parsing "1234.5000" into a double is the drift ADR-025 keeps out
 * of the app, so it stays out of the check too: a string becomes a count of
 * ten-thousandths in a BigInt, which adds and compares without loss.
 */
const PLACES = 4;
const ONE = 10n ** BigInt(PLACES);

export function toUnits(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(value.trim());
  if (!match) throw new Error(`Not a quantity: ${value}`);

  const [, sign, whole, fraction = ''] = match;
  const units = BigInt(whole) * ONE + BigInt(fraction.padEnd(PLACES, '0'));

  return sign === '-' ? -units : units;
}

export function fromUnits(units: bigint): string {
  const sign = units < 0n ? '-' : '';
  const magnitude = units < 0n ? -units : units;
  const fraction = String(magnitude % ONE).padStart(PLACES, '0');

  return `${sign}${magnitude / ONE}.${fraction}`;
}

export function sumUnits(values: string[]): bigint {
  return values.reduce((total, value) => total + toUnits(value), 0n);
}

/** Whole units, rounded up: how many to receive to cover a shortfall. */
export function wholeUnitsUp(units: bigint): number {
  if (units <= 0n) return 0;
  return Number((units + ONE - 1n) / ONE);
}
