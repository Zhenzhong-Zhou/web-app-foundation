import type { OrderLine } from '../lib/types';

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
