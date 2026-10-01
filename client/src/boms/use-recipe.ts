import { useCallback, useEffect, useRef, useState } from 'react';

import { api, messageFor } from '../lib/api';
import type { Bom, BomDetail } from '../lib/types';

/**
 * A variant's recipe versions, and the one to show: the one the caller just
 * acted on, then the active version, then the newest — so promoting or
 * duplicating leaves the person looking at what they changed rather than
 * jumping elsewhere.
 */
async function fetchRecipe(variantId: string, preferId?: string) {
  const versions = await api<Bom[]>(`/boms?outputVariantId=${variantId}`);

  const pick =
    versions.find((row) => row.id === preferId) ??
    versions.find((row) => row.status === 'active') ??
    versions[0];

  const selected = pick ? await api<BomDetail>(`/boms/${pick.id}`) : null;

  return { versions, selected };
}

/**
 * The recipe panel's data: a variant's versions, the selected one and the
 * error banner, read when the variant changes and again by load() after an
 * action. Either way, an answer that arrives after the person has switched
 * variant is dropped, so the previous variant's recipe never lands on screen.
 */
export function useRecipe(variantId: string, enabled: boolean) {
  const [versions, setVersions] = useState<Bom[]>([]);
  const [selected, setSelected] = useState<BomDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** The variant on screen, for load()'s late answers. */
  const shown = useRef(variantId);

  useEffect(() => {
    shown.current = variantId;
  }, [variantId]);

  const load = useCallback(
    async (preferId?: string) => {
      if (!variantId) return;

      try {
        const recipe = await fetchRecipe(variantId, preferId);

        if (shown.current !== variantId) return;

        setVersions(recipe.versions);
        setSelected(recipe.selected);
        setError(null);
      } catch (caught) {
        if (shown.current === variantId) setError(messageFor(caught));
      }
    },
    [variantId],
  );

  /**
   * The same read as load(), run inline when the variant changes. Inline
   * because setState reached synchronously from an effect body triggers
   * cascading renders; the `ignore` flag set by the cleanup is how an effect
   * drops an answer that arrives after the variant changed.
   */
  useEffect(() => {
    if (!enabled || !variantId) return;

    let ignore = false;

    void (async () => {
      try {
        const recipe = await fetchRecipe(variantId);

        if (ignore) return;

        setVersions(recipe.versions);
        setSelected(recipe.selected);
        setError(null);
      } catch (caught) {
        if (!ignore) setError(messageFor(caught));
      }
    })();

    return () => {
      ignore = true;
    };
  }, [enabled, variantId]);

  return { versions, selected, error, setError, load };
}
