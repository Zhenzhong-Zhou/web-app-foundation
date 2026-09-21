import { useEffect, useState } from 'react';

import { api } from './api';
import type { VariantOption } from './types';

/**
 * The catalogue, fetched each time `active` turns true — when a dialog opens,
 * not when its page mounts.
 *
 * The stale case is the one that matters: a variant created a moment ago in
 * another tab, to be ordered or received now. A list fetched at page load
 * leaves it missing from the picker until a refresh, and "the item I just
 * made is not there" reads as data loss. ReceiveStockDialog made this call
 * first; this is that decision in one place.
 *
 * The cost is one request per open, for a list the server returns without
 * pagination. Worth revisiting — with a search endpoint the picker queries as
 * you type — once catalogues reach thousands.
 */
export function useVariants(active: boolean): {
  variants: VariantOption[];
  /** The picker is empty because the request failed, not the catalogue. */
  failed: boolean;
} {
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active) return;

    let ignore = false;

    void api<VariantOption[]>('/products/variants')
      .then((rows) => {
        if (ignore) return;
        setVariants(rows);
        setFailed(false);
      })
      .catch(() => {
        if (!ignore) setFailed(true);
      });

    return () => {
      ignore = true;
    };
  }, [active]);

  return { variants, failed };
}
