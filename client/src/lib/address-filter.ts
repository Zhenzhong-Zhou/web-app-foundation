/**
 * A list's filter as the address gives it (ADR-058): Home's "See all"
 * opens a list already narrowed, `/orders?direction=sale&status=confirmed`.
 * Read once, when the page opens; pressing a filter afterwards changes the
 * list, not the address. A value the list does not know is ignored, and the
 * list opens as it always did.
 */
export function fromAddress<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = params.get(key);
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** A switch the address turns on: `?expiring=1`. */
export function flagFromAddress(params: URLSearchParams, key: string): boolean {
  return params.get(key) === '1';
}
