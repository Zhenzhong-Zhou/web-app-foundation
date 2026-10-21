import type { HomeResponse, OrderLine, Welcome } from '../api/types.gen';

/**
 * An order line for a client test, complete, with whatever the case is about
 * overridden. One builder, so a field added to OrderLine is added here once
 * rather than in every spec that builds a line (vitest does not type-check,
 * so a stale hand-built line would only fail in tsc).
 *
 * The SKU and description derive from the id, so two lines in one fixture
 * cannot silently share a SKU and make every row query ambiguous.
 */
export function orderLine(over: Partial<OrderLine> = {}): OrderLine {
  const id = over.id ?? 'line-1';

  return {
    id,
    variantId: 'variant-plain',
    sku: `WIDGET-${id.slice(-1)}`,
    description: `Widget ${id.slice(-1)}`,
    quantityOrdered: '40.0000',
    quantityFulfilled: '0.0000',
    quantityOutstanding: '40.0000',
    quantityReturned: '0.0000',
    quantityCredited: '0.0000',
    quantityUnsettled: '0.0000',
    unitPrice: null,
    currency: null,
    priceSource: null,
    priceListId: null,
    priceListName: null,
    lineTotal: null,
    isComplete: false,
    isClosedShort: false,
    closedReason: null,
    ...over,
  };
}

/** Getting started with every step done: Home leads with the cards. */
export const GETTING_STARTED_DONE: HomeResponse['gettingStarted'] = {
  steps: {
    organization: true,
    location: true,
    product: true,
    partner: true,
    receipt: true,
    invoice: true,
    team: true,
  },
  teamSkipped: false,
  dismissed: false,
  complete: true,
};

/**
 * A welcome on Home (ADR-079): Wang Fang, a Viewer who joined on 20
 * October, invited by Mei Lin with a note, three items open.
 */
export function welcome(over: Partial<Welcome> = {}): Welcome {
  return {
    joinedOn: '2026-10-20',
    lastDay: '2026-11-03',
    founder: false,
    inviter: { id: 'user-mei', name: 'Mei Lin', photoFileId: null },
    note: 'Welcome, Wang Fang!\nOn Monday you’ll shadow Li Na.',
    access: {
      role: { id: 'role-viewer', name: 'Viewer', description: null },
      holdsEverything: false,
      whomToAsk: [
        { id: 'user-mei', name: 'Mei Lin', photoFileId: null },
        { id: 'user-david', name: 'David Park', photoFileId: null },
      ],
    },
    items: [
      { key: 'sayWhoYouAre', done: false, what: null },
      { key: 'lookUp', done: false, what: null },
      { key: 'openOrder', done: false, what: null },
    ],
    ...over,
  };
}
