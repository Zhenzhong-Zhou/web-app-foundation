import { useState } from 'react';

import { withQuery } from './api';

export type SortOrder = 'asc' | 'desc';

/** A list's sort: the column, and which way. */
export interface ListSort<K extends string> {
  key: K;
  order: SortOrder;
}

/**
 * A list's sort (ADR-057): none until a header is chosen, then that column
 * ascending, then descending on a second click. The list stays newest first
 * until then, as every list was, unless a filter that is on has an order of
 * its own, `byFilter` (ADR-091): Expiring soon by expiry, soonest first.
 * That order shows on its header, as a chosen one does, and a header chosen
 * replaces it.
 */
export function useListSort<K extends string>(
  byFilter: ListSort<K> | null = null,
) {
  const [chosen, setChosen] = useState<ListSort<K> | null>(null);

  function toggle(key: K) {
    setChosen((current) => {
      const shown = current ?? byFilter;
      return shown?.key === key
        ? { key, order: shown.order === 'asc' ? 'desc' : 'asc' }
        : { key, order: 'asc' };
    });
  }

  return { sort: chosen ?? byFilter, toggle };
}

/** A list's path with its sort added, when there is one. */
export function withSort<K extends string>(
  path: string,
  sort: { key: K; order: SortOrder } | null,
): string {
  return sort ? withQuery(path, { sort: sort.key, order: sort.order }) : path;
}
