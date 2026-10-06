import { defineMessages } from 'react-intl';

import { intl } from '../i18n/intl';
import type { OrderDirection, OrderStatus } from '../lib/types';

const WORDS = defineMessages({
  draft: { id: 'orders.status.draft', defaultMessage: 'Draft' },
  confirmed: { id: 'orders.status.confirmed', defaultMessage: 'Confirmed' },
  cancelled: { id: 'orders.status.cancelled', defaultMessage: 'Cancelled' },
  received: { id: 'orders.status.received', defaultMessage: 'Received' },
  shipped: { id: 'orders.status.shipped', defaultMessage: 'Shipped' },
  closeOrder: { id: 'orders.action.close', defaultMessage: 'Close order' },
  confirm: { id: 'orders.action.confirm', defaultMessage: 'Confirm' },
  cancelOrder: { id: 'orders.action.cancel', defaultMessage: 'Cancel order' },
});

/**
 * The word for "done" depends on which way the goods went. The server stores
 * one status, `fulfilled`, so one rule governs both directions (ADR-041);
 * only what a person reads differs. In the reader's language (ADR-054).
 */
export function doneLabel(direction: OrderDirection): string {
  return intl().formatMessage(
    direction === 'sale' ? WORDS.shipped : WORDS.received,
  );
}

/**
 * What an order's status chip says: its status by name, with "done" in the
 * direction's own word. One place, so the list and the detail page cannot
 * name the same status two ways.
 */
export function orderStatusLabel(
  status: OrderStatus,
  direction: OrderDirection,
): string {
  if (status === 'fulfilled') return doneLabel(direction);
  return intl().formatMessage(WORDS[status]);
}

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
  if (next === 'fulfilled') return intl().formatMessage(WORDS.closeOrder);
  if (next === 'confirmed') return intl().formatMessage(WORDS.confirm);
  return intl().formatMessage(WORDS.cancelOrder);
}
