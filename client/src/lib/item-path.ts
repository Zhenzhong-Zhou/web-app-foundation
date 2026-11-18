/**
 * The item's page at Where it stands, or at one of its parts, `#held`
 * (ADR-093, R8): the one path every list's "10 left · reorder at 36", a
 * short figure and Stock of the item open.
 */
export function whereItStands(productId: string, part = 'stock'): string {
  return `/items/${productId}#${part}`;
}
