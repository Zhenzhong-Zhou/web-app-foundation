import { useEffect, useState } from 'react';

import type { VariantOption } from '../api/types.gen';
import { api } from './api';

/**
 * The catalogue, fetched each time `active` turns true — when a dialog opens,
 * not when its page mounts — and again whenever `again` changes while it is:
 * New order's retry, and the recipe panel's Add opening and closing. Every
 * item picker reads it here (ADR-056, amended).
 *
 * The stale case is the one that matters: a variant created a moment ago in
 * another tab, to be ordered or received now. A list fetched at page load
 * leaves it missing from the picker until a refresh, and "the item I just
 * made is not there" reads as data loss. ReceiveStockDialog made this call
 * first; this is that decision in one place.
 *
 * The cost is one request per open, for a list the server returns without
 * pagination. What is typed into a picker is searched on the server
 * (VariantPicker); this list is what it shows before anything is, and what
 * the forms read a chosen item's unit from.
 */
export function useVariants(
  active: boolean,
  again?: unknown,
): {
  variants: VariantOption[];
  /**
   * The catalogue has come back, rows or a failure. Until then an empty list
   * is not an empty catalogue, and nothing says there are no products
   * (#250). The last answer stays while the next is read, as the rows do.
   */
  answered: boolean;
  /** The picker is empty because the request failed, not the catalogue. */
  failed: boolean;
} {
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [answered, setAnswered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active) return;

    let ignore = false;

    void api<VariantOption[]>('/products/variants')
      .then((rows) => {
        if (ignore) return;
        setVariants(rows);
        setFailed(false);
        setAnswered(true);
      })
      .catch(() => {
        if (ignore) return;
        setFailed(true);
        setAnswered(true);
      });

    return () => {
      ignore = true;
    };
  }, [active, again]);

  return { variants, answered, failed };
}
