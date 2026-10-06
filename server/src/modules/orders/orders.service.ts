import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';

import { pageOf } from '../../common/keyset';
import {
  orderLines,
  orders,
  partners,
  priceLists,
  products,
  productVariants,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { itemName } from '../stock/item-name';
import { ListOrdersDto } from './dto/list-orders.dto';

const DEFAULT_LIMIT = 25;

/** Draft and confirmed: the documents somebody still has to do something about. */
const OPEN_STATUSES = ['draft', 'confirmed'] as const;

/**
 * Reading orders: the paged list and one order's detail.
 *
 * Creating, duplicating and changing an order is OrderLifecycleService; its
 * lines are OrderLinesService, and receiving against it
 * OrderReceiptsService. This keeps the reads, as InvoicesService and
 * ShipmentsService do.
 */
@Injectable()
export class OrdersService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * Newest first, paged by keyset, filtered to open orders by default.
   *
   * Three things this does that the partners list does not, all because
   * orders accumulate forever where partners do not:
   *
   * The partner's name is joined in. A list showing partner_id is a list
   * nobody can read, and the alternative — the client fetching every partner
   * and joining in JS — is a second request plus a lookup that goes stale
   * between them.
   *
   * Ordered and fulfilled totals come from two correlated subqueries rather
   * than the detail read. "What is still outstanding" is the question this
   * screen exists to answer, and opening each order to find out is the
   * annoyance the column removes. They are cheap here only because the page
   * is bounded: unpaginated, these would aggregate over every line ever
   * written.
   *
   * The sums stay strings. numeric(18,4) through JS is how a quantity loses
   * its last decimal place (ADR-025) — the client renders what Postgres
   * computed and does no arithmetic on it.
   */
  async list(query: ListOrdersDto) {
    const limit = query.limit ?? DEFAULT_LIMIT;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const scope = [eq(orders.organizationId, organizationId)];

      if (query.before) scope.push(lt(orders.id, query.before));
      if (query.partnerId) scope.push(eq(orders.partnerId, query.partnerId));

      if (!query.status || query.status === 'open') {
        scope.push(inArray(orders.status, [...OPEN_STATUSES]));
      } else if (query.status !== 'all') {
        scope.push(eq(orders.status, query.status));
      }

      const rows = await tx
        .select({
          id: orders.id,
          partnerId: orders.partnerId,
          partnerName: partners.name,
          direction: orders.direction,
          isSample: orders.isSample,
          status: orders.status,
          reference: orders.reference,
          expectedAt: orders.expectedAt,
          createdAt: orders.createdAt,

          lineCount: sql<number>`(
            select count(*)::int from ${orderLines}
            where ${orderLines.orderId} = ${orders.id}
          )`,
          quantityOrdered: sql<string>`(
            select coalesce(sum(${orderLines.quantityOrdered}), 0)::text
            from ${orderLines} where ${orderLines.orderId} = ${orders.id}
          )`,
          quantityFulfilled: sql<string>`(
            select coalesce(sum(${orderLines.quantityFulfilled}), 0)::text
            from ${orderLines} where ${orderLines.orderId} = ${orders.id}
          )`,
        })
        .from(orders)
        // Inner, not left: partner_id is not null and the foreign key
        // restricts deletion, so an order with no partner cannot exist.
        .innerJoin(partners, eq(partners.id, orders.partnerId))
        .where(and(...scope))
        // By id, not created_at. UUIDv7 sorts chronologically (ADR-010), so
        // this is the same order with a single-column cursor and no tiebreak.
        .orderBy(desc(orders.id))
        // One extra row, to know whether there is another page without
        // counting the table.
        .limit(limit + 1);

      return pageOf(rows, limit);
    });
  }

  /**
   * The order, its lines, and the partner's name.
   *
   * The name is joined for the same reason the list joins it: a detail page
   * headed by a UUID is a page nobody can read. `fullyReceived` is computed
   * here rather than in the client because comparing two numeric(18,4) values
   * means parsing them into doubles (ADR-025) — Postgres knows the answer and
   * a boolean survives the trip intact.
   */
  async findById(orderId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [order] = await tx
        .select({
          id: orders.id,
          partnerId: orders.partnerId,
          partnerName: partners.name,
          direction: orders.direction,
          isSample: orders.isSample,
          status: orders.status,
          reference: orders.reference,
          expectedAt: orders.expectedAt,
          note: orders.note,
          duplicatedFromId: orders.duplicatedFromId,
          createdAt: orders.createdAt,

          /**
           * True when no line is short. `bool_and` over zero lines returns
           * null, but an order always has at least one (ADR-027), so the
           * coalesce is belt and braces rather than a real case.
           */
          fullyFulfilled: sql<boolean>`coalesce((
            select bool_and(
              ${orderLines.quantityFulfilled} >= ${orderLines.quantityOrdered}
              or ${orderLines.isClosedShort}
            )
            from ${orderLines} where ${orderLines.orderId} = ${orders.id}
          ), false)`,

          /**
           * One row per currency on the order, not a single total. With a
           * currency per line there is no meaningful sum unless every line
           * agrees, and converting at display time would change the number every
           * day the page is opened (ADR-035).
           *
           * An order in one currency yields one row, which is the common case
           * and reads as a total. A mixed one yields two, which is the truth.
           */
          totals: sql<{ currency: string; amount: string }[]>`coalesce((
          select json_agg(
            json_build_object('currency', t.currency, 'amount', t.amount::text)
            order by t.currency
          )
          from (
            select ${orderLines.currency} as currency,
                   sum(${orderLines.unitPrice} * ${orderLines.quantityOrdered}) as amount
            from ${orderLines}
            where ${orderLines.orderId} = ${orders.id}
              and ${orderLines.unitPrice} is not null
            group by ${orderLines.currency}
          ) t
        ), '[]'::json)`,

          /**
           * False when any line is unpriced. The subtotals above then exclude it
           * silently, and a number that quietly omits a line is the one somebody
           * reconciles against.
           */
          totalsComplete: sql<boolean>`not exists (
          select 1 from ${orderLines}
          where ${orderLines.orderId} = ${orders.id}
            and ${orderLines.unitPrice} is null
        )`,
        })
        .from(orders)
        .innerJoin(partners, eq(partners.id, orders.partnerId))
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.organizationId, organizationId),
          ),
        );

      if (!order)
        throw new NotFoundException(
          t({ id: 'orders.suchOrder', defaultMessage: 'No such order' }),
        );

      const lines = await tx
        .select({
          id: orderLines.id,
          variantId: orderLines.variantId,
          sku: orderLines.sku,
          productName: products.name,
          variantName: productVariants.name,
          quantityOrdered: orderLines.quantityOrdered,
          quantityFulfilled: orderLines.quantityFulfilled,
          quantityReturned: orderLines.quantityReturned,

          unitPrice: orderLines.unitPrice,
          currency: orderLines.currency,

          /**
           * Where the price came from (ADR-049): a list, typed by hand, or
           * nothing yet. The list's name is read live — renaming a list is a
           * label change, and the line keeps its own price regardless.
           */
          priceSource: orderLines.priceSource,
          priceListId: orderLines.priceListId,
          priceListName: priceLists.name,

          /**
           * Unrounded. Rounding to two places is currency-specific — JPY has
           * no minor unit — so the query would be baking one convention into
           * every order. Formatting knows the currency; this does not.
           */
          lineTotal: sql<string | null>`(
            ${orderLines.unitPrice} * ${orderLines.quantityOrdered}
          )::text`,

          /**
           * No more is coming, and why (ADR-034). The quantities above stay as
           * they are — reducing the ordered amount to what arrived would erase
           * the shortfall, and with it any way to tell a short shipment from an
           * accurate one.
           */
          isClosedShort: orderLines.isClosedShort,
          closedReason: orderLines.closedReason,

          /**
           * What is still to come. Computed here because subtracting two
           * numeric(18,4) values in JS means parsing both into doubles
           * (ADR-025). greatest(…, 0) because an over-receipt is recorded as
           * an unreferenced movement rather than on the line — a negative
           * would be nonsense if that ever changed.
           *
           * Zero on a closed line: outstanding means still expected, and
           * nothing is.
           */
          quantityOutstanding: sql<string>`case
          when ${orderLines.isClosedShort} then 0::numeric(18,4)
          else greatest(
            ${orderLines.quantityOrdered} - ${orderLines.quantityFulfilled}, 0
          )
        end::text`,

          /**
           * For hiding the Receive control, which the server refuses with a
           * 409 once a line is full or closed. A boolean rather than leaving
           * the client to compare: it could only do so by parsing, and matching
           * the outstanding string against '0.0000' would break the day the
           * scale changes.
           */
          isComplete: sql<boolean>`
          ${orderLines.quantityFulfilled} >= ${orderLines.quantityOrdered}
          or ${orderLines.isClosedShort}
        `,
        })
        .from(orderLines)
        .innerJoin(
          productVariants,
          eq(productVariants.id, orderLines.variantId),
        )
        .innerJoin(products, eq(products.id, productVariants.productId))
        .leftJoin(priceLists, eq(priceLists.id, orderLines.priceListId))
        .where(
          and(
            eq(orderLines.orderId, orderId),
            eq(orderLines.organizationId, organizationId),
          ),
        )
        .orderBy(desc(orderLines.createdAt));

      // Named from the catalogue beside the snapshot SKU, as the packing slip
      // does: read by a person, not kept as a record.
      return {
        ...order,
        lines: lines.map(({ productName, variantName, ...line }) => ({
          ...line,
          description: itemName(productName, variantName),
        })),
      };
    });
  }
}
