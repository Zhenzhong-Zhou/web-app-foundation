import { defineMessages, type MessageDescriptor } from 'react-intl';

import type { LookupResult } from '../api/types.gen';
import { NAV_LABELS } from '../layout/navigation';
import type { LookupKind } from '../lib/api-names';

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

/**
 * What each kind's "Show all" names: the page it opens, as the menu names
 * it (#149). A lot's opens Inventory, so it says Inventory, not Lots.
 */
export const LIST_LABELS: Record<LookupKind, MessageDescriptor> = {
  ...KIND_LABELS,
  lot: NAV_LABELS.inventory,
};

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
      return `/items/${result.productId ?? ''}`;
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
 * its address; null where there is none.
 */
export function listOf(kind: LookupKind, query: string): string | null {
  const search = `search=${encodeURIComponent(query)}`;
  switch (kind) {
    case 'order':
      return `/orders?${search}`;
    case 'invoice':
      return `/invoices?${search}`;
    case 'lot':
      return `/inventory?${search}`;
    case 'item':
      // On All, discontinued items included, so whatever the top bar found
      // is on the list (ADR-092, amending ADR-056).
      return `/items?tab=all&discontinued=include&${search}`;
    case 'partner':
      return `/partners?${search}`;
    case 'productionRun':
      return `/production?${search}`;
    case 'returnAuthorization':
      return `/return-authorizations?${search}`;
    case 'creditNote':
      return `/credit-notes?${search}`;
  }
}
