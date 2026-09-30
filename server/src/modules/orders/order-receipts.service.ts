import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { recordContext } from '../../core/audit/audit-context';
import { isCheckViolation } from '../../database/errors';
import { orderLines } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { StockService } from '../stock/stock.service';
import type { ReceiveLineDto } from './dto/receive-line.dto';
import { loadOrder } from './load-order';

/**
 * Receiving goods against an order's line: the receipt movement and the
 * line's fulfilled quantity, in one transaction (ADR-023). The order's status
 * is not moved here — finishing an order stays a person's decision (ADR-027).
 *
 * Its own service because it was the only part of OrdersService that wrote
 * to stock, and so the only part that needed StockService.
 */
@Injectable()
export class OrderReceiptsService {
  private readonly logger = new Logger(OrderReceiptsService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly stock: StockService,
  ) {}

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
      const order = await loadOrder(tx, organizationId, orderId);

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

      // Which item, for the audit row: the body names a quantity, and an
      // order has several lines. The snapshotted SKU, as the line shows it.
      recordContext({ sku: line.sku });

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
          // What was agreed on the line, carried onto the valuation as a
          // snapshot (ADR-048). An unpriced line gives nothing, and the
          // receipt waits for a cost.
          cost:
            line.unitPrice !== null && line.currency !== null
              ? { unitPrice: line.unitPrice, currency: line.currency }
              : null,
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
}
