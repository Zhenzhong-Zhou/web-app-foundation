import { useEffect } from 'react';

import { api } from './api';

/** The kinds of record whose opening is remembered (ADR-058). */
export type RecentKind =
  | 'order'
  | 'invoice'
  | 'lot'
  | 'product'
  | 'partner'
  | 'run'
  | 'return'
  | 'priceList';

export interface RecentEntry {
  kind: RecentKind;
  id: string;
  /** Null where the record has no name yet: a draft invoice. */
  title: string | null;
  detail: string | null;
  openedAt: string;
}

/** Where each kind's page is. */
export const RECENT_PATHS: Record<RecentKind, (id: string) => string> = {
  order: (id) => `/orders/${id}`,
  invoice: (id) => `/invoices/${id}`,
  lot: (id) => `/lots/${id}`,
  product: (id) => `/products/${id}`,
  partner: (id) => `/partners/${id}`,
  run: (id) => `/production/${id}`,
  return: (id) => `/return-authorizations/${id}`,
  priceList: (id) => `/settings/price-lists/${id}`,
};

/**
 * A record page reports that it opened, once its record has loaded
 * (ADR-058): once per record, and never in the way. A failure to remember
 * is not the person's problem, so it is not shown.
 */
export function useRecordOpened(
  kind: RecentKind,
  id: string | undefined,
  loaded: boolean,
): void {
  useEffect(() => {
    if (!id || !loaded) return;
    api('/recent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id }),
    }).catch(() => undefined);
  }, [kind, id, loaded]);
}
