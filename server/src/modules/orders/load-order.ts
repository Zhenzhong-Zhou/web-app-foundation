import { NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { orders } from '../../database/schema';
import { t } from '../../i18n/translate';
import type { Tx } from '../stock/stock.service';

/**
 * One order of this organization, or a 404, locked for the rest of the
 * transaction.
 *
 * The organization is in the where clause rather than checked after, so an
 * order that belongs to someone else reads exactly like one that does not
 * exist: nothing about another tenant's ids leaks through the difference
 * between 403 and 404. Eight places wrote this lookup out, and it is the
 * part of each that must never drift.
 *
 * Callers add their own rules after it — sales only, not yet cancelled —
 * because those differ by action.
 *
 * Locked (FOR UPDATE) because every caller goes on to change the order or
 * its lines, and each decides by what it just read: a line is added only to
 * a draft, an order is cancelled only if nothing moved against it. With
 * the row locked, a second change to the same order waits for the first to
 * commit and then reads what it left, so no rule is checked against a state
 * that is already gone (#26).
 */
export async function loadOrder(
  tx: Tx,
  organizationId: string,
  orderId: string,
) {
  const [order] = await tx
    .select()
    .from(orders)
    .where(
      and(eq(orders.id, orderId), eq(orders.organizationId, organizationId)),
    )
    .for('update');

  if (!order)
    throw new NotFoundException(
      t({ id: 'orders.suchOrder', defaultMessage: 'No such order' }),
    );

  return order;
}
