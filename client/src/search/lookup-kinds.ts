import { defineMessages, type MessageDescriptor } from 'react-intl';

import type { LookupKind, LookupResult } from '../lib/types';

/** Each kind's heading in the results (ADR-056). */
export const KIND_LABELS: Record<LookupKind, MessageDescriptor> =
  defineMessages({
    order: { id: 'search.kind.order', defaultMessage: 'Orders' },
    invoice: { id: 'search.kind.invoice', defaultMessage: 'Invoices' },
    creditNote: {
      id: 'search.kind.creditNote',
      defaultMessage: 'Credit notes',
    },
    lot: { id: 'search.kind.lot', defaultMessage: 'Lots' },
    item: { id: 'search.kind.item', defaultMessage: 'Items' },
    partner: { id: 'search.kind.partner', defaultMessage: 'Partners' },
    productionRun: {
      id: 'search.kind.productionRun',
      defaultMessage: 'Production runs',
    },
    returnAuthorization: {
      id: 'search.kind.returnAuthorization',
      defaultMessage: 'Returns',
    },
  });

/** Where a result opens. */
export function pathOf(kind: LookupKind, result: LookupResult): string {
  switch (kind) {
    case 'order':
      return `/orders/${result.id}`;
    case 'invoice':
      return `/invoices/${result.id}`;
    case 'creditNote':
      return `/credit-notes/${result.id}`;
    case 'lot':
      return `/lots/${result.id}`;
    case 'item':
      return `/products/${result.productId ?? ''}`;
    case 'partner':
      return `/partners/${result.id}`;
    case 'productionRun':
      return `/production/${result.id}`;
    case 'returnAuthorization':
      return `/return-authorizations/${result.id}`;
  }
}

/**
 * The list that searches the same way, for "Show all", with the query in
 * its address; null where there is none (credit notes are found from their
 * invoice).
 */
export function listOf(kind: LookupKind, query: string): string | null {
  const search = `search=${encodeURIComponent(query)}`;
  switch (kind) {
    case 'order':
      return `/orders?${search}`;
    case 'invoice':
      return `/invoices?${search}`;
    case 'lot':
    case 'item':
      return kind === 'lot' ? `/inventory?${search}` : `/products?${search}`;
    case 'partner':
      return `/partners?${search}`;
    case 'productionRun':
      return `/production?${search}`;
    case 'returnAuthorization':
      return `/return-authorizations?${search}`;
    case 'creditNote':
      return null;
  }
}
