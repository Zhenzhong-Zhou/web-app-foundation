import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { withQuery } from './api';
import { useAddressWrite } from './use-list-filters';

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
 *
 * The chosen sort is kept in the address with the filters (ADR-091),
 * `?sort=expiry&order=desc`, written as useListFilters writes; a column
 * not in `keys`, or an order neither way, is ignored.
 *
 * `header(key)` is what a SortHeader needs. The list is read again after
 * a sort and its table drawn anew, so the header pressed takes back the
 * focus it had (ADR-091).
 */
export function useListSort<K extends string>(
  keys: readonly K[],
  byFilter: ListSort<K> | null = null,
) {
  const [params] = useSearchParams();
  const write = useAddressWrite();
  const [pressed, setPressed] = useState<K | null>(null);

  const key = params.get('sort');
  const order = params.get('order');
  const chosen: ListSort<K> | null =
    (keys as readonly string[]).includes(key ?? '') &&
    (order === 'asc' || order === 'desc')
      ? { key: key as K, order }
      : null;
  const sort = chosen ?? byFilter;

  function toggle(column: K) {
    setPressed(column);
    write({
      sort: column,
      order: sort?.key === column && sort.order === 'asc' ? 'desc' : 'asc',
    });
  }

  function header(column: K) {
    return {
      active: sort?.key === column,
      order: sort?.order ?? 'asc',
      onSort: () => toggle(column),
      refocus: pressed === column,
    };
  }

  return { sort, header };
}

/** A list's path with its sort added, when there is one. */
export function withSort<K extends string>(
  path: string,
  sort: { key: K; order: SortOrder } | null,
): string {
  return sort ? withQuery(path, { sort: sort.key, order: sort.order }) : path;
}
