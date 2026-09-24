/**
 * Exact sums of numeric(18, 4) strings, for display only.
 *
 * ADR-025 keeps quantities out of JS doubles, because 0.1 + 0.2 is not 0.3
 * there. A dialog that must say "these add up to 300" before the server is
 * asked needs an exact answer, so each string is scaled to an integer of
 * ten-thousandths and summed as a BigInt. The server still decides; this only
 * stops a click that can only fail.
 */

const SCALE = 4;

/**
 * Ten-thousandths as a BigInt. Blank is zero; anything that is not a plain
 * non-negative decimal of at most four places is null.
 */
export function toScaled(value: string): bigint | null {
  const trimmed = value.trim();
  if (trimmed === '') return 0n;
  if (!/^\d+(\.\d{1,4})?$/.test(trimmed)) return null;

  const [whole, fraction = ''] = trimmed.split('.');
  return BigInt(whole + fraction.padEnd(SCALE, '0'));
}

/** Back to four places, the way the server prints numeric(18, 4). */
export function fromScaled(value: bigint): string {
  const digits = value.toString().padStart(SCALE + 1, '0');
  return `${digits.slice(0, -SCALE)}.${digits.slice(-SCALE)}`;
}

/** The exact total, or null when any amount is not a number. */
export function sumDecimals(values: string[]): bigint | null {
  let total = 0n;

  for (const value of values) {
    const scaled = toScaled(value);
    if (scaled === null) return null;
    total += scaled;
  }

  return total;
}
