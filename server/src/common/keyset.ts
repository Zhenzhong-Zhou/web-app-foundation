/** One page of a keyset list, as every list endpoint returns it (ADR-018). */
export interface KeysetPage<T> {
  entries: T[];
  /** Pass as `before` for the next page. Null when there is no more. */
  nextCursor: string | null;
}

/**
 * The page from rows fetched with `limit + 1`. The extra row is how the list
 * knows there is more without a count; it is dropped, and the last row kept
 * is the cursor. Inferring "more" from a full page instead would be wrong
 * exactly once, on a last page that happens to be full.
 */
export function pageOf<T extends { id: string }>(
  rows: T[],
  limit: number,
): KeysetPage<T> {
  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;

  return {
    entries,
    nextCursor: hasMore ? entries[entries.length - 1].id : null,
  };
}
