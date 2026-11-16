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
 * `header(key)` is what a SortHeader needs; `set(key, order)` is a sort
 * chosen any other way, a phone's Sort or a date column's menu; `clear()`
 * goes back to the list's own order. No page writes the pair itself
 * (#551's 62).
 *
 * The list is read again after
 * a sort with its table's head kept on the page, the placeholder in its
 * body alone (PlaceholderRows), so the header pressed keeps its focus
 * throughout (#505's 54), with nothing to put back.
 */
export function useListSort<K extends string>(
  keys: readonly K[],
  byFilter: ListSort<K> | null = null,
) {
  const [params] = useSearchParams();
  const write = useAddressWrite();

  const key = params.get('sort');
  const order = params.get('order');
  const chosen: ListSort<K> | null =
    (keys as readonly string[]).includes(key ?? '') &&
    (order === 'asc' || order === 'desc')
      ? { key: key as K, order }
      : null;
  const sort = chosen ?? byFilter;

  function toggle(column: K) {
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
    };
  }

  function set(column: K, way: SortOrder) {
    write({ sort: column, order: way });
  }

  /**
   * The sort cleared, with whatever else the same press clears, `also`, in
   * one write: two would each start from the address as it was, and the
   * second would put back what the first cleared.
   */
  function clear(also: Record<string, null> = {}) {
    write({ ...also, sort: null, order: null });
  }

  return { sort, header, set, clear };
}

/** A list's path with its sort added, when there is one. */
export function withSort<K extends string>(
  path: string,
  sort: { key: K; order: SortOrder } | null,
): string {
  return sort ? withQuery(path, { sort: sort.key, order: sort.order }) : path;
}
