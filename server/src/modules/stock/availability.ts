import { ConflictException } from '@nestjs/common';
import { and, eq, type SQL, sql } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import { todayOf } from '../../core/organizations/time-zone';
import { productVariants } from '../../database/schema';
import { t } from '../../i18n/translate';
import type { Tx } from './stock.service';
import { usableByItem, usableByLocation } from './usable-stock';

/** One open sale line's hold on a product (ADR-045). */
export interface LineHold {
  variantId: string;
  lineId: string;
  orderId: string;
  /** What the line still needs: ordered minus shipped. */
  outstanding: string;
  /** What it holds: its share of stock, earliest confirmed first. */
  held: string;
  /** What it needs and cannot hold: the backorder. */
  short: string;
}

/**
 * Every open confirmed sale line of the items in `variants`, a
 * parenthesised list or subquery of ids, with what each holds (ADR-045).
 *
 * Computed, never stored. A line holds what is left of its product's supply
 * after every earlier-confirmed line, up to what it still needs — so when
 * stock runs short the first order confirmed keeps its hold and the last goes
 * short, rather than every order blocking every other. Supply is usable
 * stock, the one rule (usable-stock.ts; ADR-045 amended by ADR-093): at
 * locations marked available, since a retention or quarantine bin holds
 * stock nobody can promise (ADR-042), less lots expired by the
 * organization's `today` and what released runs were issued. A caller
 * that has read it already passes it as `supply`, rows `variant_id,
 * usable`, so it is read once (code-figures.ts).
 *
 * One query for one product or for many, so the rule exists once: a
 * code's figures and the check that guards a shipment cannot disagree.
 */
export function holdsSql(
  organizationId: string,
  today: string,
  variants: SQL,
  supply: SQL = usableByItem(organizationId, today, variants),
): SQL {
  return sql`
    with demand as (
      select
        ol.variant_id,
        ol.id as line_id,
        o.id as order_id,
        ol.quantity_ordered - ol.quantity_fulfilled as outstanding,
        coalesce(
          sum(ol.quantity_ordered - ol.quantity_fulfilled) over (
            partition by ol.variant_id
            order by o.confirmed_at, o.id, ol.id
            rows between unbounded preceding and 1 preceding
          ),
          0
        ) as before
      from order_lines ol
      join orders o on o.id = ol.order_id
      where ol.organization_id = ${organizationId}::uuid
        -- Redundant for correctness, since a line's order is in its
        -- organization, but without it Postgres cannot use
        -- orders_org_status_idx and reads every tenant's confirmed sales
        -- to join them (ADR-051's plan check found it).
        and o.organization_id = ${organizationId}::uuid
        and o.direction = 'sale'
        and o.status = 'confirmed'
        -- order_lines_open_idx is built on exactly these two conditions;
        -- change them together or the index stops being used.
        and not ol.is_closed_short
        and ol.quantity_ordered > ol.quantity_fulfilled
        and ol.variant_id in ${variants}
    ),
    supply as (${supply})
    select
      d.variant_id,
      d.line_id,
      d.order_id,
      d.outstanding,
      -- Cast back to the column's type: a literal 0 winning greatest()
      -- would otherwise print as "0" beside "40.0000".
      greatest(0, least(d.outstanding, coalesce(s.usable, 0) - d.before))::numeric(18, 4) as held
    from demand d
    left join supply s on s.variant_id = d.variant_id
  `;
}

/**
 * One product's usable stock, what is expired or issued beside it, and
 * every line's hold on it. Expired and issued are the not usable at
 * places marked available: what a hold cannot draw on, though it is on
 * the shelf a shipment takes from.
 */
export async function holdsFor(
  tx: Tx,
  organizationId: string,
  variantId: string,
): Promise<{
  supply: string;
  expiredOrIssued: string;
  lines: LineHold[];
}> {
  const today = await todayOf(tx, organizationId);

  const [supply] = (
    await tx.execute(sql`
      select
        coalesce(sum(u.usable), 0)::numeric(18, 4)::text as usable,
        coalesce(sum(u.expired + u.issued), 0)::numeric(18, 4)::text as expired_or_issued
      from (${usableByLocation(organizationId, today, sql`(${variantId}::uuid)`)}) u
    `)
  ).rows as { usable: string; expired_or_issued: string }[];

  const lines = (
    await tx.execute(sql`
      select
        h.variant_id,
        h.line_id,
        h.order_id,
        h.outstanding::text as outstanding,
        h.held::text as held,
        (h.outstanding - h.held)::text as short
      from (${holdsSql(organizationId, today, sql`(${variantId}::uuid)`)}) h
    `)
  ).rows as {
    variant_id: string;
    line_id: string;
    order_id: string;
    outstanding: string;
    held: string;
    short: string;
  }[];

  return {
    supply: supply.usable,
    expiredOrIssued: supply.expired_or_issued,
    lines: lines.map((row) => ({
      variantId: row.variant_id,
      lineId: row.line_id,
      orderId: row.order_id,
      outstanding: row.outstanding,
      held: row.held,
      short: row.short,
    })),
  };
}

/**
 * Serialises everything that spends one product's unheld stock (ADR-045).
 *
 * Transaction-scoped, released at commit or rollback. Without it two
 * transactions could each see the same fifty unheld units and both take them.
 * Callers touching several products take these in product-id order — the same
 * rule every row lock here follows — so they cannot deadlock. inVariantOrder
 * below is that order.
 */
export async function lockProduct(
  tx: Tx,
  organizationId: string,
  variantId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${variantId}`}, 0))`,
  );
}

/**
 * Items sorted by product id: the one order in which anything touching several
 * products takes its locks — the product locks above, and the rows each
 * movement writes. Two transactions over the same products then take them in
 * the same sequence, and one waits for the other instead of each holding what
 * the other needs. Returns a sorted copy; the input is left as it was.
 */
export function inVariantOrder<T>(
  items: readonly T[],
  variantOf: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const left = variantOf(a);
    const right = variantOf(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/**
 * Refuses to take more than may be taken (ADR-045).
 *
 * For an order: its own hold plus whatever usable stock nobody holds. For
 * anything else — a production release, a hand-out, a one-off shipment —
 * only the usable stock nobody holds. Stock expired or issued to a run is
 * on the shelf but holds nothing, so taking it would leave the orders that
 * need the usable short (ADR-045 amended by ADR-093): refused, saying how
 * many are expired or issued, with the item for the screen to open its
 * Where it stands. Compared in SQL, so no quantity goes through a double
 * (ADR-025). Locks the product first, so the answer stays true until the
 * caller's transaction ends.
 */
export async function assertTakeable(
  tx: Tx,
  input: {
    organizationId: string;
    variantId: string;
    quantity: string;
    sku: string;
    forOrderId?: string;
  },
): Promise<void> {
  await lockProduct(tx, input.organizationId, input.variantId);

  const { supply, expiredOrIssued, lines } = await holdsFor(
    tx,
    input.organizationId,
    input.variantId,
  );

  const heldByOthers = lines
    .filter((line) => line.orderId !== input.forOrderId)
    .map((line) => sql`(${line.held}::numeric)`);

  const values = sql.join([sql`(0::numeric)`, ...heldByOthers], sql`, `);

  const [check] = (
    await tx.execute(sql`
      select
        sum(v.held) > 0 as anything_held,
        (${supply}::numeric - sum(v.held)) < ${input.quantity}::numeric as too_much,
        greatest(${supply}::numeric - sum(v.held), 0)::numeric(18, 4)::text as takeable,
        sum(v.held)::numeric(18, 4)::text as held,
        ${expiredOrIssued}::numeric > 0 as any_not_usable
      from (values ${values}) as v(held)
    `)
  ).rows as {
    anything_held: boolean;
    too_much: boolean;
    takeable: string;
    held: string;
    any_not_usable: boolean;
  }[];

  /**
   * Only a refusal about holds when holds are the reason. With nothing held
   * for anyone else, a shortfall is a plain shortage, and the stock check —
   * which names the location and says "not enough stock" — is the right
   * one to answer it.
   */
  if (!(check.anything_held && check.too_much)) return;

  const orders = input.forOrderId
    ? t({
        id: 'stock.heldForOtherOrders',
        defaultMessage: 'other orders',
      })
    : t({
        id: 'stock.heldForConfirmedOrders',
        defaultMessage: 'confirmed orders',
      });

  if (!check.any_not_usable) {
    throw new ConflictException(
      t(
        {
          id: 'stock.takeableSkuTakenHeld',
          defaultMessage:
            'Only {takeable} {sku} can be taken: {held} is held for {orders}.',
        },
        { takeable: check.takeable, sku: input.sku, held: check.held, orders },
      ),
    );
  }

  const [variant] = await tx
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.id, input.variantId),
        eq(productVariants.organizationId, input.organizationId),
      ),
    );

  throw new ConflictException(
    withCode(
      t(
        {
          id: 'stock.takeableSkuNotUsable',
          defaultMessage:
            'Only {takeable} {sku} can be taken: {held} is held for {orders}, and {notUsable} more is expired or issued to a run. Where it stands, on the item’s page, shows which.',
        },
        {
          takeable: check.takeable,
          sku: input.sku,
          held: check.held,
          orders,
          notUsable: expiredOrIssued,
        },
      ),
      ERROR_CODES.stockNotUsable,
      { productId: variant.productId },
    ),
  );
}
