import { BadRequestException, ConflictException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Tx } from '../stock/stock.service';

/** The list an order's new lines take their default prices from. */
export interface ActiveList {
  id: string;
  name: string;
  currency: string;
}

/**
 * Which list applies to an order (ADR-049), or null.
 *
 * - A sample never takes a list price: it is priced at zero, or left
 *   unpriced, on purpose.
 * - A purchase takes the supplier's purchase list. There is no organization
 *   default for purchases: a supplier's price is specific to the supplier.
 * - A sale takes the customer's sale list, or the organization's default when
 *   the customer has none or theirs is retired.
 *
 * Plain SQL with every table aliased, as the other multi-table reads are.
 */
export async function listForOrder(
  tx: Tx,
  organizationId: string,
  order: { direction: string; isSample: boolean; partnerId: string },
): Promise<ActiveList | null> {
  if (order.isSample) return null;

  const found = await tx.execute(sql`
    select p.sale_price_list_id, p.purchase_price_list_id,
           o.default_sale_price_list_id
    from partners p
    join organizations o on o.id = p.organization_id
    where p.id = ${order.partnerId}::uuid
      and p.organization_id = ${organizationId}::uuid
  `);

  const [row] = found.rows as {
    sale_price_list_id: string | null;
    purchase_price_list_id: string | null;
    default_sale_price_list_id: string | null;
  }[];

  if (!row) return null;

  const candidates = (
    order.direction === 'purchase'
      ? [row.purchase_price_list_id]
      : [row.sale_price_list_id, row.default_sale_price_list_id]
  ).filter((id): id is string => id !== null);

  if (candidates.length === 0) return null;

  const lists = await tx.execute(sql`
    select l.id, l.name, l.currency
    from price_lists l
    where l.organization_id = ${organizationId}::uuid
      and l.is_active
      and l.direction = ${order.direction}
      and l.id in (${sql.join(
        candidates.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
  `);

  const active = lists.rows as unknown as ActiveList[];

  // The first candidate that is active wins: the partner's own list before
  // the organization's default.
  for (const id of candidates) {
    const list = active.find((candidate) => candidate.id === id);
    if (list) return list;
  }

  return null;
}

/** One item's price on a list, or null when the list does not have it. */
export async function priceOnList(
  tx: Tx,
  organizationId: string,
  priceListId: string,
  variantId: string,
): Promise<string | null> {
  const found = await tx.execute(sql`
    select i.unit_price
    from price_list_items i
    where i.organization_id = ${organizationId}::uuid
      and i.price_list_id = ${priceListId}::uuid
      and i.variant_id = ${variantId}::uuid
  `);

  const [row] = found.rows as { unit_price: string }[];
  return row?.unit_price ?? null;
}

/**
 * Checks a list may be named as a partner's or the organization's default
 * (ADR-049). Direction is a cross-table rule, so it is enforced here rather
 * than by a check constraint (ADR-025).
 *
 * Refusals follow the usual order: an id that is not this organization's
 * list, or a list of the wrong direction, is a malformed request (400); a
 * retired list is a real list that cannot take new work (409).
 */
export async function assertListAssignable(
  tx: Tx,
  organizationId: string,
  priceListId: string,
  direction: 'sale' | 'purchase',
): Promise<void> {
  const found = await tx.execute(sql`
    select l.name, l.direction, l.is_active
    from price_lists l
    where l.id = ${priceListId}::uuid
      and l.organization_id = ${organizationId}::uuid
  `);

  const [list] = found.rows as {
    name: string;
    direction: string;
    is_active: boolean;
  }[];

  if (!list) throw new BadRequestException('Unknown price list');

  if (list.direction !== direction) {
    throw new BadRequestException(
      `${list.name} is a ${list.direction} list, and this needs a ${direction} list`,
    );
  }

  if (!list.is_active) {
    throw new ConflictException(`${list.name} is retired`);
  }
}
