import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';

import { calendarRange } from '../../common/date-range';
import { pageOf } from '../../common/keyset';
import { codeMatches, searchTerms } from '../../common/search';
import {
  creditNoteLines,
  creditNotes,
  invoiceLines,
  invoices,
  orderLines,
  orderReturns,
  orders,
  partners,
  priceLists,
  products,
  productVariants,
  shipments,
  stockMovements,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { partnerMatches } from '../partners/partner-search';
import { itemName } from '../stock/item-name';
import { ListOrdersDto } from './dto/list-orders.dto';

const DEFAULT_LIMIT = 25;

/**
 * An order's quantities summed, all its lines counting in one unit.
 * Exported because findById's return type names it, and the controller
 * returning that type has to be able to name it too (TS4053).
 */
export interface OrderQuantities {
  unit: string;
  ordered: string;
  fulfilled: string;
  returned: string;
  outstanding: string;
}

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
      // By expected date (ADR-057); an order without one is left out.
      scope.push(...calendarRange(orders.expectedAt, query));
      // Its reference or its partner's name (ADR-056).
      if (query.search) {
        const terms = searchTerms(query.search);
        const match = or(
          codeMatches(orders.reference, terms),
          partnerMatches(orders.partnerId, terms),
        );
        if (match) scope.push(match);
      }

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

          /**
           * What a sale has billed and given back (ADR-055), summed here so
           * the browser never adds up money. Including tax, from issued
           * documents only: a draft bills nothing yet.
           *
           * A voided invoice counts in both, through the full credit note
           * voiding issued for it (ADR-046), so it nets to nothing and the
           * shipment's new invoice is not counted twice.
           */
          invoiced: sql<string>`coalesce((
            select sum(${invoices.total}) from ${invoices}
            where ${invoices.orderId} = ${orders.id}
              and ${invoices.status} in ('issued', 'voided')
          ), 0)::numeric(18,4)::text`,
          credited: sql<string>`coalesce((
            select sum(${creditNotes.total})
            from ${creditNotes}
            join ${invoices} on ${invoices.id} = ${creditNotes.invoiceId}
            where ${invoices.orderId} = ${orders.id}
          ), 0)::numeric(18,4)::text`,

          // The two above, subtracted here: in JavaScript it would mean
          // parsing both into doubles (ADR-025).
          netInvoiced: sql<string>`(
            coalesce((
              select sum(${invoices.total}) from ${invoices}
              where ${invoices.orderId} = ${orders.id}
                and ${invoices.status} in ('issued', 'voided')
            ), 0)
            - coalesce((
              select sum(${creditNotes.total})
              from ${creditNotes}
              join ${invoices} on ${invoices.id} = ${creditNotes.invoiceId}
              where ${invoices.orderId} = ${orders.id}
            ), 0)
          )::numeric(18,4)::text`,

          /**
           * What is still to be invoiced, before tax: each priced line's
           * price times what will be billed and is on no standing invoice.
           * What will be billed is the ordered quantity, or what shipped on
           * a line closed short (ADR-034). A credit note does not add to
           * it: those goods were billed, and the credit is their own figure.
           *
           * Unrounded, as `totals` are: rounding belongs to the currency,
           * which the client formats with.
           */
          notInvoiced: sql<string>`coalesce((
            select sum(${orderLines.unitPrice} * greatest(
              case when ${orderLines.isClosedShort}
                then ${orderLines.quantityFulfilled}
                else ${orderLines.quantityOrdered}
              end - coalesce((
                select sum(${invoiceLines.quantity})
                from ${invoiceLines}
                join ${invoices} on ${invoices.id} = ${invoiceLines.invoiceId}
                where ${invoiceLines.orderLineId} = ${orderLines.id}
                  and ${invoices.status} = 'issued'
              ), 0),
              0
            ))
            from ${orderLines}
            where ${orderLines.orderId} = ${orders.id}
              and ${orderLines.unitPrice} is not null
          ), 0)::text`,

          /**
           * Returns received with no RMA (ADR-047): nobody has yet decided
           * on a credit, a replacement or nothing for them, so they are the
           * loose end an accountant looks for.
           */
          unsettledReturns: sql<number>`(
            select count(*)::int from ${orderReturns}
            where ${orderReturns.orderId} = ${orders.id}
              and ${orderReturns.returnAuthorizationId} is null
          )`,

          /**
           * How many records each of the order's tabs holds (ADR-055), for
           * the counts beside their names. Voided shipments are counted:
           * they stay on the record, struck through.
           */
          shipmentCount: sql<number>`(
            select count(*)::int from ${shipments}
            where ${shipments.orderId} = ${orders.id}
          )`,
          voidedShipmentCount: sql<number>`(
            select count(*)::int from ${shipments}
            where ${shipments.orderId} = ${orders.id}
              and ${shipments.voidedAt} is not null
          )`,
          returnCount: sql<number>`(
            select count(*)::int from ${orderReturns}
            where ${orderReturns.orderId} = ${orders.id}
          )`,

          /**
           * The order's quantities summed, when every line counts in the same
           * unit (ADR-055): 600 bottles ordered reads as one figure. Null when
           * the units differ, since 600 bottles and 15 kg add up to nothing.
           * Summed here, as everything quantity is (ADR-025).
           */
          quantities: sql<OrderQuantities | null>`(
            select case when count(distinct ${productVariants.unitOfMeasure}) = 1
              then json_build_object(
                'unit', min(${productVariants.unitOfMeasure}),
                'ordered', sum(${orderLines.quantityOrdered})::text,
                'fulfilled', sum(${orderLines.quantityFulfilled})::text,
                'returned', sum(${orderLines.quantityReturned})::text,
                'outstanding', sum(case
                  when ${orderLines.isClosedShort} then 0
                  else greatest(
                    ${orderLines.quantityOrdered} - ${orderLines.quantityFulfilled},
                    0
                  )
                end)::numeric(18,4)::text
              )
            end
            from ${orderLines}
            join ${productVariants}
              on ${productVariants.id} = ${orderLines.variantId}
            where ${orderLines.orderId} = ${orders.id}
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

          /**
           * Credited on a credit note against this line's invoices (ADR-047),
           * beside Returned: 7 returned and 2 credited shows the 5 nobody
           * has settled. Voiding's full credit notes are left out; they
           * reverse an invoice, not goods that came back.
           */
          quantityCredited: sql<string>`coalesce((
            select sum(${creditNoteLines.quantity})
            from ${creditNoteLines}
            join ${creditNotes}
              on ${creditNotes.id} = ${creditNoteLines.creditNoteId}
            join ${invoiceLines}
              on ${invoiceLines.id} = ${creditNoteLines.invoiceLineId}
            where ${invoiceLines.orderLineId} = ${orderLines.id}
              and not ${creditNotes.isVoid}
          ), 0)::numeric(18,4)::text`,

          /**
           * This line's goods on returns with no RMA, matched by variant: an
           * order holds one line per variant.
           */
          quantityUnsettled: sql<string>`coalesce((
            select sum(${stockMovements.quantity})
            from ${stockMovements}
            join ${orderReturns}
              on ${orderReturns.id} = ${stockMovements.referenceId}
            where ${stockMovements.referenceType} = 'order_return'
              and ${orderReturns.orderId} = ${orderLines.orderId}
              and ${orderReturns.returnAuthorizationId} is null
              and ${stockMovements.variantId} = ${orderLines.variantId}
          ), 0)::numeric(18,4)::text`,
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

      /**
       * A sale's invoices and credit notes (ADR-055), for its "Invoices and
       * credits" tab: what was billed and given back, as documents, each
       * with what it covered. Drafts included, marked as such; a credit
       * note is always issued.
       */
      const invoiceRows =
        order.direction === 'sale' && !order.isSample
          ? await tx
              .select({
                id: invoices.id,
                number: invoices.number,
                status: invoices.status,
                date: invoices.invoiceDate,
                total: invoices.total,
                currency: invoices.currency,
                shippedAt: shipments.createdAt,
                quantity: sql<string>`coalesce((
                  select sum(${invoiceLines.quantity})
                  from ${invoiceLines}
                  where ${invoiceLines.invoiceId} = ${invoices.id}
                ), 0)::numeric(18,4)::text`,
              })
              .from(invoices)
              .innerJoin(shipments, eq(shipments.id, invoices.shipmentId))
              .where(
                and(
                  eq(invoices.orderId, orderId),
                  eq(invoices.organizationId, organizationId),
                ),
              )
              .orderBy(invoices.createdAt)
          : [];

      const creditRows =
        order.direction === 'sale' && !order.isSample
          ? await tx
              .select({
                id: creditNotes.id,
                number: creditNotes.number,
                date: creditNotes.creditDate,
                total: creditNotes.total,
                currency: creditNotes.currency,
                reason: creditNotes.reason,
                isVoid: creditNotes.isVoid,
                invoiceNumber: invoices.number,
                quantity: sql<string>`coalesce((
                  select sum(${creditNoteLines.quantity})
                  from ${creditNoteLines}
                  where ${creditNoteLines.creditNoteId} = ${creditNotes.id}
                ), 0)::numeric(18,4)::text`,
              })
              .from(creditNotes)
              .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId))
              .where(
                and(
                  eq(invoices.orderId, orderId),
                  eq(creditNotes.organizationId, organizationId),
                ),
              )
              .orderBy(creditNotes.createdAt)
          : [];

      /**
       * Money and settling are a sale's (ADR-055). A purchase records no
       * supplier invoices and a sample is never invoiced, so for them the
       * summary is null rather than a row of zeros that would read as
       * "nothing owed".
       */
      const {
        invoiced,
        credited,
        netInvoiced,
        notInvoiced,
        unsettledReturns,
        shipmentCount,
        voidedShipmentCount,
        returnCount,
        ...rest
      } = order;
      const sale = order.direction === 'sale' && !order.isSample;

      // Named from the catalogue beside the snapshot SKU, as the packing slip
      // does: read by a person, not kept as a record.
      return {
        ...rest,
        money: sale
          ? {
              // One currency per sale (ADR-046 amendment): the totals' one.
              currency: order.totals[0]?.currency ?? null,
              invoiced,
              credited,
              netInvoiced,
              notInvoiced,
            }
          : null,
        unsettledReturns: sale ? unsettledReturns : 0,
        counts: {
          shipments: shipmentCount,
          voidedShipments: voidedShipmentCount,
          returns: returnCount,
          documents: invoiceRows.length + creditRows.length,
        },
        documents: sale
          ? { invoices: invoiceRows, creditNotes: creditRows }
          : null,
        lines: lines.map(
          ({ productName, variantName, quantityUnsettled, ...line }) => ({
            ...line,
            quantityUnsettled: sale ? quantityUnsettled : '0.0000',
            description: itemName(productName, variantName),
          }),
        ),
      };
    });
  }
}
