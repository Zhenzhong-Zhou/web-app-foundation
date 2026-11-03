import { useEffect, useState } from 'react';

import type { Bom } from '../api/types.gen';
import { api } from '../lib/api';

/**
 * An item's recipes as Plan a run and Release offer them: the active one
 * and the archived versions, never a draft, which is unfinished. Read for
 * `variantId` while it is set, and again on `retry`.
 *
 * Waiting, answered or failed, as useVariants says it for the catalogue.
 * The answer is kept with the item it answers, so until this item's have
 * come, no other item's are taken for them (#290). A failed read is not an
 * item with no recipe: each dialog says the read failed, with Try again
 * beside the words, since choosing the same item again changes nothing.
 */
export function useRecipes(variantId: string): {
  recipes: Bom[];
  /** This item's recipes have come back, rows or a failure. */
  answered: boolean;
  /** The list is empty because the read failed, not the item. */
  failed: boolean;
  /** Reads them again, waiting meanwhile. */
  retry: () => void;
  /** Forgets the answer, for a dialog that closes. */
  reset: () => void;
} {
  const [read, setRead] = useState<{
    variantId: string;
    rows: Bom[] | null;
  } | null>(null);
  // A count that reads them again, as New order reads its catalogue again.
  const [reads, setReads] = useState(0);

  useEffect(() => {
    if (!variantId) return;

    let ignore = false;

    void api<Bom[]>(`/boms?outputVariantId=${variantId}`)
      .then((rows) => {
        if (!ignore)
          setRead({
            variantId,
            rows: rows.filter((row) => row.status !== 'draft'),
          });
      })
      .catch(() => {
        if (!ignore) setRead({ variantId, rows: null });
      });

    return () => {
      ignore = true;
    };
  }, [variantId, reads]);

  const answer = variantId && read?.variantId === variantId ? read : null;

  return {
    recipes: answer?.rows ?? [],
    answered: answer !== null,
    failed: answer?.rows === null,
    retry: () => {
      setRead(null);
      setReads((count) => count + 1);
    },
    reset: () => setRead(null),
  };
}
