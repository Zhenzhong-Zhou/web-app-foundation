import type { OrderDetail } from '../api/types.gen';

/**
 * Whether the server sent this order's prices (ADR-080). Its line prices,
 * totals and tax go only to a reader holding orders.view_prices, so the
 * screens leave their columns, figures and documents out, never a dash
 * where a price would be. Read from the order, which is what the server
 * decided, rather than from the session.
 */
export function showsPrices(order: Pick<OrderDetail, 'totals'>): boolean {
  return order.totals !== undefined;
}
