import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { isCheckViolation, isUniqueViolation } from '../../database/errors';
import {
  orderLines,
  orders,
  partners,
  productVariants,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { StockService, type Tx } from '../stock/stock.service';
import type { CreateOrderDto } from './dto/create-order.dto';
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

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly stock: StockService,
  ) {}

  /** Newest first. Lines are on the detail read, not the list. */
  list() {
    return this.tenantDb.select(orders, undefined, {
      orderBy: desc(orders.createdAt),
    });
  }

  async findById(orderId: string) {
    const [order] = await this.tenantDb.select(orders, eq(orders.id, orderId));

    if (!order) throw new NotFoundException('No such order');

    const lines = await this.tenantDb.select(
      orderLines,
      eq(orderLines.orderId, orderId),
      { orderBy: desc(orderLines.createdAt) },
    );

    return { ...order, lines };
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
            updatedAt: new Date(),
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
        })
        .returning();

      inserted.push(row);
    }

    return inserted;
  }
}
