import { useEffect } from 'react';

import type { RecentEntry } from '../api/types.gen';
import { api } from './api';

/**
 * A record recently opened, generated from the server's OpenAPI document
 * (ADR-068). Its title is null where the record has no name yet, as a
 * draft invoice has none.
 */
export type { RecentEntry } from '../api/types.gen';

/** The kinds of record whose opening is remembered (ADR-058). */
export type RecentKind = RecentEntry['kind'];

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
