import { NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { orders } from '../../database/schema';
import { t } from '../../i18n/translate';
import type { Tx } from '../stock/stock.service';

/**
 * One order of this organization, or a 404.
 *
 * The organization is in the where clause rather than checked after, so an
 * order that belongs to someone else reads exactly like one that does not
 * exist: nothing about another tenant's ids leaks through the difference
 * between 403 and 404. Eight places wrote this lookup out, and it is the
 * part of each that must never drift.
 *
 * Callers add their own rules after it — sales only, not yet cancelled —
 * because those differ by action.
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
    );

  if (!order)
    throw new NotFoundException(
      t({ id: 'orders.suchOrder', defaultMessage: 'No such order' }),
    );

  return order;
}
