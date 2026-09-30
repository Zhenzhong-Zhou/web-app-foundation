import type { OrderDirection, OrderStatus } from '../lib/types';

/**
 * The word for "done" depends on which way the goods went. The server stores
 * one status, `fulfilled`, so one rule governs both directions (ADR-041);
 * only what a person reads differs.
 */
export const DONE: Record<OrderDirection, string> = {
  purchase: 'Received',
  sale: 'Shipped',
};

/**
 * Mirrors ALLOWED_FROM in OrdersService, and is not the enforcement.
 *
 * The server refuses an illegal transition with a 409 whatever this says —
 * offering a button that always fails is the thing being avoided, not the
 * rule being implemented. Fulfilled and cancelled are terminal by hand: an
 * order that turns out wrong is corrected by an adjustment movement, not by
 * reopening the document (ADR-023). The one way back is voiding a shipment
 * that never left, which reopens the order (ADR-046).
 */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
};

/**
 * Button labels. What clicking does, not what the order is.
 *
 * Closing is "Close order" in both directions (#24). It was "Mark shipped"
 * and "Mark received", which read as the act of shipping or receiving —
 * those have their own buttons, and closing says only that nothing more
 * is coming.
 */
export function transitionLabel(next: OrderStatus): string {
  if (next === 'fulfilled') return 'Close order';
  if (next === 'confirmed') return 'Confirm';
  return 'Cancel order';
}
