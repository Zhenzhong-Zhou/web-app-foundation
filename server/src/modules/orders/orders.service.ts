import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';

import { isCheckViolation, isUniqueViolation } from '../../database/errors';
import {
  addresses,
  orderLines,
  orders,
  partners,
  productVariants,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { StockService, type Tx } from '../stock/stock.service';
import { CloseLineDto } from './dto/close-line.dto';
import type { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { AddOrderLineDto, UpdateOrderLineDto } from './dto/order-line.dto';
import type { ReceiveLineDto } from './dto/receive-line.dto';
import type { UpdateOrderDto } from './dto/update-order.dto';

type OrderLine = typeof orderLines.$inferSelect;

/**
 * Which status changes are allowed, and from where.
 *
 * A table rather than a chain of ifs, so an illegal transition is a lookup
 * that fails rather than a branch someone forgot to write. Cancelled and
 * received are terminal: a received order that turns out wrong is corrected by
 * an adjustment movement, not by reopening the document (ADR-023).
 */
const ALLOWED_FROM: Record<string, readonly string[]> = {
  draft: [],
  confirmed: ['draft'],
  received: ['confirmed'],
  cancelled: ['draft', 'confirmed'],
};

const DEFAULT_LIMIT = 25;

/** Draft and confirmed: the documents somebody still has to do something about. */
const OPEN_STATUSES = ['draft', 'confirmed'] as const;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly stock: StockService,
  ) {}

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

      const hasMore = rows.length > limit;
      const entries = hasMore ? rows.slice(0, limit) : rows;

      return {
        entries,
        nextCursor: hasMore ? entries[entries.length - 1].id : null,
      };
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
          fullyReceived: sql<boolean>`coalesce((
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

      if (!order) throw new NotFoundException('No such order');

      const lines = await tx
        .select({
          id: orderLines.id,
          variantId: orderLines.variantId,
          sku: orderLines.sku,
          quantityOrdered: orderLines.quantityOrdered,
          quantityFulfilled: orderLines.quantityFulfilled,

          unitPrice: orderLines.unitPrice,
          currency: orderLines.currency,

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
        .where(
          and(
            eq(orderLines.orderId, orderId),
            eq(orderLines.organizationId, organizationId),
          ),
        )
        .orderBy(desc(orderLines.createdAt));

      return { ...order, lines };
    });
  }

  /**
   * The order and its lines together, because an order with no lines is a
   * document that orders nothing — and a failure after the header insert would
   * leave one behind. Same reasoning as products and their first variant
   * (ADR-023).
   */
  async create(input: CreateOrderDto, actorId: string) {
    try {
      return await this.tenantDb.transaction(async (tx, organizationId) => {
        const [partner] = await tx
          .select()
          .from(partners)
          .where(
            and(
              eq(partners.id, input.partnerId),
              eq(partners.organizationId, organizationId),
            ),
          );

        if (!partner) throw new BadRequestException('Unknown partner');

        // Retired partners stay in the directory but cannot take new orders —
        // that is the whole point of retiring rather than deleting (ADR-026).
        if (!partner.isActive) {
          throw new ConflictException(`${partner.name} is retired`);
        }

        const [order] = await tx
          .insert(orders)
          .values({
            organizationId,
            partnerId: input.partnerId,
            direction: input.direction,
            reference: input.reference ?? null,
            expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
            note: input.note ?? null,
            createdBy: actorId,
          })
          .returning();

        const lines = await this.insertLines(
          tx,
          organizationId,
          order.id,
          input.lines,
        );

        this.logger.log(
          `Order ${order.id} created: ${input.direction}, ${lines.length} lines`,
        );

        return { ...order, lines };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        // The only unique constraint on order_lines. Two lines for one variant
        // make "how much did we order" ambiguous; amending is what editing is.
        throw new ConflictException(
          'The same item appears twice — amend the quantity instead',
        );
      }
      throw error;
    }
  }

  /**
   * Copies an order into a fresh draft (ADR-031).
   *
   * One rule decides every field: a duplicate re-resolves snapshots from their
   * live source and never copies frozen ones forward. A snapshot exists to
   * freeze what happened, and this has not happened yet.
   *
   * The intended flow is duplicate, fix, confirm, then cancel the original.
   * Cancelling first leaves nothing behind if this fails, and it is the order
   * people do it in anyway.
   */
  async duplicate(orderId: string, actorId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [source] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.organizationId, organizationId),
            eq(orders.id, orderId),
          ),
        );

      if (!source) throw new NotFoundException('No such order');

      const [partner] = await tx
        .select()
        .from(partners)
        .where(
          and(
            eq(partners.id, source.partnerId),
            eq(partners.organizationId, organizationId),
          ),
        );

      /**
       * Checked again rather than assumed from the original. The partner was
       * active when that order was raised; retiring one is exactly what should
       * stop a new order going to them, and a duplicate is a new order
       * (ADR-026).
       */
      if (!partner?.isActive) {
        throw new ConflictException(
          `${partner?.name ?? 'That partner'} is retired`,
        );
      }

      const sourceLines = await tx
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, orderId))
        .orderBy(asc(orderLines.id));

      if (sourceLines.length === 0) {
        throw new ConflictException('That order has no lines to copy');
      }

      /**
       * Duplicating a partly received order would re-order what already
       * arrived (ADR-031). Copying only the shortfall is a backorder, which
       * means something different and is open — so this refuses rather than
       * quietly doing the wrong one.
       */
      if (sourceLines.some((line) => Number(line.quantityFulfilled) > 0)) {
        throw new ConflictException(
          'Part of this order has already been received — duplicating it would re-order what arrived',
        );
      }

      const shipTo = await this.reResolveShipTo(tx, organizationId, source);

      const [order] = await tx
        .insert(orders)
        .values({
          organizationId,
          partnerId: source.partnerId,
          direction: source.direction,
          note: source.note,
          createdBy: actorId,
          duplicatedFromId: source.id,
          ...shipTo,

          /**
           * Absent on purpose, each for its own reason. `status` defaults to
           * draft because the point is that somebody reviews it. `reference`
           * is the supplier's PO number for the order it was issued against,
           * and two orders claiming it is a reconciliation problem.
           * `expectedAt` would be last month's date on a new order, wrong
           * every time. Quantities fulfilled start at zero because nothing has
           * arrived.
           */
        })
        .returning();

      /**
       * insertLines re-reads each variant to snapshot its SKU, so the copy
       * picks up a renamed SKU for free — and refuses a variant that has since
       * moved organizations, which a blind copy of the old line would not.
       */
      const lines = await this.insertLines(
        tx,
        organizationId,
        order.id,
        sourceLines.map((line) => ({
          variantId: line.variantId,
          quantityOrdered: line.quantityOrdered,
          unitPrice: line.unitPrice ?? undefined,
          currency: line.currency ?? undefined,
        })),
      );

      this.logger.log(
        `Order ${order.id} duplicated from ${source.id}, ${lines.length} lines`,
      );

      return { ...order, lines };
    });
  }

  /**
   * Header fields and status. Lines are edited through their own routes,
   * because changing a quantity that has already been partly received is a
   * different question from renaming a reference.
   */
  async update(orderId: string, input: UpdateOrderDto) {
    const [existing] = await this.tenantDb.select(
      orders,
      eq(orders.id, orderId),
    );

    if (!existing) throw new NotFoundException('No such order');

    /**
     * A reference is matched against a supplier invoice once goods arrive, so
     * changing it afterwards breaks that link silently. Expected date and note
     * carry no such dependency and stay editable at any status — what other
     * records depend on is what becomes immutable.
     */
    if (
      input.reference !== undefined &&
      input.reference !== existing.reference &&
      existing.status === 'received'
    ) {
      throw new ConflictException(
        'The reference cannot change once an order is received — it is what a supplier invoice is matched against',
      );
    }

    if (input.status && input.status !== existing.status) {
      const from = ALLOWED_FROM[input.status] ?? [];

      if (!from.includes(existing.status)) {
        throw new ConflictException(
          `An order cannot go from ${existing.status} to ${input.status}`,
        );
      }
    }

    /**
     * Built field by field rather than spread.
     *
     * Spreading the DTO and overwriting expectedAt types it `Date | undefined`
     * where the column takes `Date | null | undefined`, and it would carry any
     * future DTO field straight into the table — which is how a validation-only
     * property ends up as a column write nobody intended.
     */
    await this.tenantDb.update(
      orders,
      {
        status: input.status,
        reference: input.reference,
        note: input.note,
        ...(input.expectedAt !== undefined
          ? { expectedAt: new Date(input.expectedAt) }
          : {}),
      },
      eq(orders.id, orderId),
    );

    this.logger.log(`Order ${orderId} updated`);
  }

  async addLine(orderId: string, input: AddOrderLineDto) {
    this.assertPriceAndCurrency(input);

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const order = await this.loadOrder(tx, organizationId, orderId);

      /**
       * Draft only. Adding an item to an order the supplier has already been
       * sent is a new agreement, not a correction — raise another order
       * (ADR-033).
       */
      if (order.status !== 'draft') {
        throw new ConflictException(
          `An item cannot be added to a ${order.status} order — raise a new one`,
        );
      }

      try {
        const [line] = await this.insertLines(tx, organizationId, orderId, [
          input,
        ]);

        this.logger.log(`Order ${orderId} gained line ${line.id}`);
        return line;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            'That item is already on this order — amend its quantity instead',
          );
        }
        throw error;
      }
    });
  }

  /**
   * Quantity only, and only while nothing has arrived.
   *
   * Allowed on a confirmed order as well as a draft: a supplier saying they
   * can only do 800 is an ordinary amendment to a live agreement, and the
   * audit entry records who changed it (ADR-033).
   */
  async updateLine(
    orderId: string,
    lineId: string,
    input: UpdateOrderLineDto,
  ): Promise<void> {
    this.assertPriceAndCurrency(input);

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const order = await this.loadOrder(tx, organizationId, orderId);
      const line = await this.loadLine(tx, orderId, lineId);

      if (order.status !== 'draft' && order.status !== 'confirmed') {
        throw new ConflictException(
          `A ${order.status} order cannot be amended`,
        );
      }

      this.assertNothingReceived(line, 'amended');

      await tx
        .update(orderLines)
        .set({
          quantityOrdered: input.quantityOrdered,
          // Only when supplied: omitting both leaves the existing price alone,
          // which is what an edit that only changes a quantity should do.
          ...(input.unitPrice !== undefined
            ? { unitPrice: input.unitPrice, currency: input.currency }
            : {}),
        })
        .where(eq(orderLines.id, lineId));

      this.logger.log(
        `Order ${orderId} line ${lineId}: quantity now ${input.quantityOrdered}`,
      );
    });
  }

  async removeLine(orderId: string, lineId: string): Promise<void> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const order = await this.loadOrder(tx, organizationId, orderId);
      const line = await this.loadLine(tx, orderId, lineId);

      /**
       * Draft only. Removing an item from an order already sent is not a
       * correction but a partial cancellation, which needs a reason and is
       * still open from ADR-027.
       */
      if (order.status !== 'draft') {
        throw new ConflictException(
          `An item cannot be removed from a ${order.status} order — cancel the order instead`,
        );
      }

      this.assertNothingReceived(line, 'removed');

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(orderLines)
        .where(eq(orderLines.orderId, orderId));

      /**
       * An order with no lines is a document that orders nothing, which is why
       * the header and its lines are written together (ADR-027). Removing the
       * last one would produce by deletion the state creation refuses.
       */
      if (count <= 1) {
        throw new ConflictException(
          'That is the only item on this order — cancel the order instead',
        );
      }

      await tx.delete(orderLines).where(eq(orderLines.id, lineId));

      this.logger.log(`Order ${orderId} line ${lineId} removed`);
    });
  }

  /**
   * Stops expecting the rest of a line (ADR-034).
   *
   * Allowed with nothing received: a line where nothing arrived and never will
   * is the same operation with quantity_fulfilled at zero.
   */
  async closeLineShort(
    orderId: string,
    lineId: string,
    input: CloseLineDto,
  ): Promise<void> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const order = await this.loadOrder(tx, organizationId, orderId);
      const line = await this.loadLine(tx, orderId, lineId);

      /**
       * Confirmed only. A draft has promised nothing, so there is no shortfall
       * to record — remove the line instead (ADR-033). A received or cancelled
       * order is already closed.
       */
      if (order.status !== 'confirmed') {
        throw new ConflictException(
          `A line on a ${order.status} order cannot be closed short`,
        );
      }

      if (line.isClosedShort) {
        throw new ConflictException('That line is already closed');
      }

      if (Number(line.quantityFulfilled) >= Number(line.quantityOrdered)) {
        throw new ConflictException(
          'That line is already complete — there is nothing outstanding to close',
        );
      }

      await tx
        .update(orderLines)
        .set({ isClosedShort: true, closedReason: input.reason })
        .where(eq(orderLines.id, lineId));

      this.logger.log(
        `Order ${orderId} line ${lineId} closed short at ${line.quantityFulfilled} of ${line.quantityOrdered}`,
      );
    });
  }

  /**
   * A supplier finding stock after all is ordinary, and closing wrote no
   * movement — so this costs nothing and its absence would mean a database
   * edit the first time somebody mis-clicks (ADR-034).
   */
  async reopenLine(orderId: string, lineId: string): Promise<void> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const order = await this.loadOrder(tx, organizationId, orderId);
      const line = await this.loadLine(tx, orderId, lineId);

      if (order.status !== 'confirmed') {
        throw new ConflictException(
          `A line on a ${order.status} order cannot be reopened`,
        );
      }

      if (!line.isClosedShort) {
        throw new ConflictException('That line is not closed');
      }

      await tx
        .update(orderLines)
        .set({ isClosedShort: false, closedReason: null })
        .where(eq(orderLines.id, lineId));

      this.logger.log(`Order ${orderId} line ${lineId} reopened`);
    });
  }

  /**
   * Receiving against a line: the movement and the fulfilment in one
   * transaction.
   *
   * This is what the nullable reference columns on stock_movements were
   * reserved for (ADR-023). An ordinary receipt movement carries
   * reference_type and reference_id, and the line's quantity_fulfilled rises
   * by the same amount — one write path, one ledger, no receipts table.
   *
   * The status is not advanced here. `received` is a person saying the order
   * is done, which can be true of a short shipment nobody expects to complete
   * (ADR-027), so it stays a decision rather than an arithmetic result.
   */
  async receive(
    orderId: string,
    lineId: string,
    input: ReceiveLineDto,
    actorId: string,
  ) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.organizationId, organizationId),
          ),
        );

      if (!order) throw new NotFoundException('No such order');

      if (order.direction !== 'purchase') {
        throw new BadRequestException(
          'Only a purchase order is received. A sale is shipped.',
        );
      }

      /**
       * Draft means nobody has committed to this yet, and cancelled means
       * somebody uncommitted. Stock arriving against either is still a real
       * event and belongs in the ledger — as a movement with no reference,
       * which is exactly what an unreferenced receipt is for.
       */
      if (order.status !== 'confirmed') {
        throw new ConflictException(
          `A ${order.status} order cannot be received against`,
        );
      }

      // Both ids together: without the second condition any line in the
      // organization could be received through any order's URL.
      const [line] = await tx
        .select()
        .from(orderLines)
        .where(and(eq(orderLines.id, lineId), eq(orderLines.orderId, orderId)));

      if (!line) throw new NotFoundException('No such line on this order');

      /**
       * Reopen first. A delivery against a line somebody closed means one of
       * them is wrong, and making the reversal explicit puts an audit entry on
       * the decision rather than inferring it from the receipt (ADR-034).
       */
      if (line.isClosedShort) {
        throw new ConflictException(
          'That line was closed short — reopen it before receiving against it',
        );
      }

      const movement = await this.stock.recordWithin(
        tx,
        organizationId,
        {
          variantId: line.variantId,
          toLocationId: input.toLocationId,
          quantity: input.quantity,
          reason: 'receipt',
          referenceType: 'purchase_order',
          referenceId: orderId,
          lot: input.lot,
          note: input.note,
        },
        actorId,
      );

      try {
        /**
         * Arithmetic in Postgres, never in JS (ADR-025), and a check
         * constraint refuses more than was ordered — an over-receipt is
         * recorded as a movement with no reference rather than a line
         * reporting 110%, which no screen renders sensibly (ADR-027).
         */
        await tx
          .update(orderLines)
          .set({
            quantityFulfilled: sql`${orderLines.quantityFulfilled} + ${input.quantity}::numeric`,
          })
          .where(eq(orderLines.id, lineId));
      } catch (error) {
        if (
          isCheckViolation(error, 'order_lines_fulfilled_within_ordered_check')
        ) {
          throw new ConflictException(
            `That is more than was ordered. ${line.quantityOrdered} ordered, ${line.quantityFulfilled} already received.`,
          );
        }
        throw error;
      }

      this.logger.log(
        `Order ${orderId} line ${lineId}: received ${input.quantity}`,
      );

      return movement;
    });
  }

  /**
   * Each line snapshots the SKU the way movements do (ADR-023), so an order
   * printed last March keeps showing what was on the label at the time while
   * variant_id still resolves to the current row.
   *
   * One at a time rather than a single multi-row insert: each needs its
   * variant loaded to read that SKU, and a line naming a variant from another
   * organization has to fail the whole order rather than be skipped.
   */
  private async insertLines(
    tx: Tx,
    organizationId: string,
    orderId: string,
    lines: CreateOrderDto['lines'],
  ): Promise<OrderLine[]> {
    const inserted: OrderLine[] = [];

    for (const line of lines) {
      const [variant] = await tx
        .select()
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, line.variantId),
            eq(productVariants.organizationId, organizationId),
          ),
        );

      if (!variant) throw new BadRequestException('Unknown variant');

      const [row] = await tx
        .insert(orderLines)
        .values({
          organizationId,
          orderId,
          variantId: line.variantId,
          sku: variant.sku,
          quantityOrdered: line.quantityOrdered,
          unitPrice: line.unitPrice ?? null,
          currency: line.currency ?? null,
        })
        .returning();

      inserted.push(row);
    }

    return inserted;
  }

  private async loadOrder(tx: Tx, organizationId: string, orderId: string) {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(eq(orders.id, orderId), eq(orders.organizationId, organizationId)),
      );

    if (!order) throw new NotFoundException('No such order');

    return order;
  }

  /**
   * Both ids together, as the receipt path does: without the second condition
   * any line in the organization could be reached through any order's URL.
   */
  private async loadLine(tx: Tx, orderId: string, lineId: string) {
    const [line] = await tx
      .select()
      .from(orderLines)
      .where(and(eq(orderLines.id, lineId), eq(orderLines.orderId, orderId)));

    if (!line) throw new NotFoundException('No such line on this order');

    return line;
  }

  /**
   * Whatever the order's status. Below what has arrived is nonsense and above
   * it is a renegotiation that should be visible as one (ADR-033).
   */
  private assertNothingReceived(line: OrderLine, verb: string): void {
    if (Number(line.quantityFulfilled) > 0) {
      throw new ConflictException(
        `${line.quantityFulfilled} has already been received against this item, so it cannot be ${verb}`,
      );
    }
  }

  /**
   * The check constraint refuses a half-priced line, but as a constraint
   * violation rather than an explanation. This says which half is missing
   * (ADR-035).
   */
  private assertPriceAndCurrency(input: {
    unitPrice?: string;
    currency?: string;
  }): void {
    if ((input.unitPrice === undefined) !== (input.currency === undefined)) {
      throw new BadRequestException(
        'A price needs a currency, and a currency needs a price',
      );
    }
  }

  /**
   * The ship-to snapshot, read from the live address rather than copied.
   *
   * Copying the stored columns forward would put an address that may have been
   * retired since onto a live order — the exact thing the snapshot was never
   * meant to enable. If the original address is gone, the partner's default
   * shipping address stands in, and the caller is told so the difference is
   * visible before the order is confirmed.
   *
   * Returns nothing when the source had no ship-to, which today is every
   * order: `create` does not set one yet. The rule is here for when it does.
   */
  private async reResolveShipTo(
    tx: Tx,
    organizationId: string,
    source: typeof orders.$inferSelect,
  ) {
    if (!source.shipToAddressId) return {};

    const [original] = await tx
      .select()
      .from(addresses)
      .where(
        and(
          eq(addresses.id, source.shipToAddressId),
          eq(addresses.organizationId, organizationId),
        ),
      );

    let address = original?.isActive ? original : undefined;

    if (!address) {
      [address] = await tx
        .select()
        .from(addresses)
        .where(
          and(
            eq(addresses.organizationId, organizationId),
            eq(addresses.partnerId, source.partnerId),
            eq(addresses.isShipping, true),
            eq(addresses.isDefault, true),
            eq(addresses.isActive, true),
          ),
        );
    }

    if (!address) return {};

    return {
      shipToAddressId: address.id,
      shipToLabel: address.label,
      shipToLine1: address.line1,
      shipToLine2: address.line2,
      shipToCity: address.city,
      shipToRegion: address.region,
      shipToPostalCode: address.postalCode,
      shipToCountry: address.country,
    };
  }
}
