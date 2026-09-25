/**
 * "Focus (60ct)", or "Focus" when the variant has no name of its own.
 *
 * The one rule for naming an item wherever a person reads it — a packing
 * slip, an order, a recall list — so the same box is never called two
 * different things on two screens.
 */
export function itemName(
  productName: string,
  variantName: string | null,
): string {
  return variantName ? `${productName} (${variantName})` : productName;
}
