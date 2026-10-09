import { useSyncExternalStore } from 'react';

import { BRAND } from './tokens';

/** What an organization changes of the look (ADR-060). */
export interface Brand {
  accent: string;
  rail: 'dark' | 'light';
}

export const DEFAULT_BRAND: Brand = { accent: BRAND.accent, rail: BRAND.rail };

let current: Brand = DEFAULT_BRAND;
const listeners = new Set<() => void>();

/**
 * The organization's look, set by AuthProvider whenever the session says
 * what it is, and read by the theme. A store rather than a context because
 * the theme sits outside the router, and AuthProvider inside it. Null, or
 * no organization, is ADR-055's defaults.
 */
export function setBrand(
  branding: { accentColor: string | null; rail: 'dark' | 'light' } | null,
): void {
  const next: Brand = {
    accent: branding?.accentColor ?? DEFAULT_BRAND.accent,
    rail: branding?.rail ?? DEFAULT_BRAND.rail,
  };
  if (next.accent === current.accent && next.rail === current.rail) return;
  current = next;
  for (const listener of listeners) listener();
}

export function useBrand(): Brand {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
