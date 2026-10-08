import { useState } from 'react';

export type SortOrder = 'asc' | 'desc';

/**
 * A list's sort (ADR-057): none until a header is chosen, then that column
 * ascending, then descending on a second click. The list stays newest first
 * until then, as every list was.
 */
export function useListSort<K extends string>() {
  const [sort, setSort] = useState<{ key: K; order: SortOrder } | null>(null);

  function toggle(key: K) {
    setSort((current) =>
      current?.key === key
        ? { key, order: current.order === 'asc' ? 'desc' : 'asc' }
        : { key, order: 'asc' },
    );
  }

  return { sort, toggle };
}

/** A list's path with its sort added, when there is one. */
export function withSort<K extends string>(
  path: string,
  sort: { key: K; order: SortOrder } | null,
): string {
  if (!sort) return path;
  return `${path}${path.includes('?') ? '&' : '?'}sort=${sort.key}&order=${sort.order}`;
}
