import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { recordPrevious } from '../../core/audit/audit-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { NOTIFICATION_TYPES } from '../../core/notifications/notification-types';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { isUniqueViolation } from '../../database/errors';
import { orderLines } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { listForOrder, priceOnList } from '../price-lists/list-price';
import { type Tx } from '../stock/stock.service';
import { CloseLineDto } from './dto/close-line.dto';
import { AddOrderLineDto, UpdateOrderLineDto } from './dto/order-line.dto';
import { loadOrder } from './load-order';
import {
  assertOneSaleCurrency,
  assertPriceAndCurrency,
  insertLines,
  pricedCurrencies,
} from './order-line-pricing';

type OrderLine = typeof orderLines.$inferSelect;

/**
 * What happens to one line of an order after the order exists: adding one,
 * repricing it, taking it off, closing it short, reopening it.
 * OrderLifecycleService keeps the order as a whole; the line rules (nothing
 * received yet, still a draft, the price and currency together) live here.
 */
@Injectable()
export class OrderLinesService {
  private readonly logger = new Logger(OrderLinesService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly notifications: NotificationsService,
  ) {}

  async addLine(orderId: string, input: AddOrderLineDto) {
    assertPriceAndCurrency(input);

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const order = await loadOrder(tx, organizationId, orderId);

      /**
       * Draft only. Adding an item to an order the supplier has already been
       * sent is a new agreement, not a correction — raise another order
       * (ADR-033).
       */
      if (order.status !== 'draft') {
        throw new ConflictException(
          t(
            {
              id: 'orders.itemAddedStatusOrder',
              defaultMessage:
                'An item cannot be added to a {status} order — raise a new one',
            },
            { status: order.status },
          ),
        );
      }

      try {
        const [line] = await insertLines(tx, organizationId, order, [input]);

        this.logger.log(`Order ${orderId} gained line ${line.id}`);
        return line;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException(
            t({
              id: 'orders.itemOrderAmendQuantity',
              defaultMessage:
                'That item is already on this order — amend its quantity instead',
            }),
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
    assertPriceAndCurrency(input);

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const order = await loadOrder(tx, organizationId, orderId);
      const line = await this.loadLine(tx, orderId, lineId);

      if (order.status !== 'draft' && order.status !== 'confirmed') {
        throw new ConflictException(
          t(
            {
              id: 'orders.statusOrderAmended',
              defaultMessage: 'A {status} order cannot be amended',
            },
            { status: order.status },
          ),
        );
      }

      this.assertNothingReceived(line, 'amended');

      /**
       * A sale stays in one currency, on a draft as much as once confirmed
       * (ADR-046, as amended): repricing a line in another would build an
       * order that confirm must refuse and no invoice could bill.
       */
      if (
        order.direction === 'sale' &&
        !order.isSample &&
        input.currency !== undefined
      ) {
        assertOneSaleCurrency(
          await pricedCurrencies(tx, orderId, lineId),
          line.sku,
          input.currency,
        );
      }

      await tx
        .update(orderLines)
        .set({
          quantityOrdered: input.quantityOrdered,
          // Only when supplied: omitting both leaves the existing price alone,
          // which is what an edit that only changes a quantity should do.
          // A price typed over a list price is the person's own (ADR-049).
          ...(input.unitPrice !== undefined
            ? {
                unitPrice: input.unitPrice,
                currency: input.currency,
                priceSource: 'manual',
                priceListId: null,
              }
            : {}),
        })
        .where(eq(orderLines.id, lineId));

      recordPrevious({
        quantityOrdered: line.quantityOrdered,
        unitPrice: line.unitPrice,
        currency: line.currency,
      });

      this.logger.log(
        `Order ${orderId} line ${lineId}: quantity now ${input.quantityOrdered}`,
      );
    });
  }

  /**
   * Prices one line from the order's list again (ADR-049): the explicit act
   * for a list corrected after the line was added. Never done in the
   * background — a draft's total does not change under someone who has not
   * touched it.
   *
   * The guards are editing a price's: a draft or confirmed order, nothing
   * received against the line, and a sale kept in one currency.
   */
  async useListPrice(orderId: string, lineId: string): Promise<void> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const order = await loadOrder(tx, organizationId, orderId);
      const line = await this.loadLine(tx, orderId, lineId);

      if (order.status !== 'draft' && order.status !== 'confirmed') {
        throw new ConflictException(
          t(
            {
              id: 'orders.statusOrderAmended',
              defaultMessage: 'A {status} order cannot be amended',
            },
            { status: order.status },
          ),
        );
      }

      this.assertNothingReceived(line, 'repriced');

      if (order.isSample) {
        throw new ConflictException(
          t({
            id: 'orders.sampleNeverPricedList',
            defaultMessage: 'A sample is never priced from a list',
          }),
        );
      }

      const list = await listForOrder(tx, organizationId, order);

      if (!list) {
        throw new ConflictException(
          t({
            id: 'orders.priceListAppliesOrder',
            defaultMessage: 'No price list applies to this order',
          }),
        );
      }

      const unitPrice = await priceOnList(
        tx,
        organizationId,
        list.id,
        line.variantId,
      );

      if (unitPrice === null) {
        throw new ConflictException(
          t(
            {
              id: 'orders.namePriceSku',
              defaultMessage: '{name} has no price for {sku}',
            },
            { name: list.name, sku: line.sku },
          ),
        );
      }

      if (order.direction === 'sale') {
        assertOneSaleCurrency(
          await pricedCurrencies(tx, orderId, lineId),
          line.sku,
          list.currency,
        );
      }

      recordPrevious({ unitPrice: line.unitPrice, currency: line.currency });

      await tx
        .update(orderLines)
        .set({
          unitPrice,
          currency: list.currency,
          priceSource: 'list',
          priceListId: list.id,
        })
        .where(eq(orderLines.id, lineId));

      this.logger.log(
        `Order ${orderId} line ${lineId}: priced from ${list.name} at ${unitPrice}`,
      );
    });
  }

  async removeLine(orderId: string, lineId: string): Promise<void> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const order = await loadOrder(tx, organizationId, orderId);
      const line = await this.loadLine(tx, orderId, lineId);

      /**
       * Draft only. Removing an item from an order already sent is not a
       * correction but a partial cancellation, which needs a reason and is
       * still open from ADR-027.
       */
      if (order.status !== 'draft') {
        throw new ConflictException(
          t(
            {
              id: 'orders.itemRemovedStatusOrder',
              defaultMessage:
                'An item cannot be removed from a {status} order — cancel the order instead',
            },
            { status: order.status },
          ),
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
          t({
            id: 'orders.itemOrderCancelOrder',
            defaultMessage:
              'That is the only item on this order — cancel the order instead',
          }),
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
    const { organizationId, sku, fulfilled, ordered } =
      await this.tenantDb.transaction(async (tx, organizationId) => {
        const order = await loadOrder(tx, organizationId, orderId);
        const line = await this.loadLine(tx, orderId, lineId);

        /**
         * Confirmed only. A draft has promised nothing, so there is no
         * shortfall to record — remove the line instead (ADR-033). A received
         * or cancelled order is already closed.
         */
        if (order.status !== 'confirmed') {
          throw new ConflictException(
            t(
              {
                id: 'orders.lineStatusOrderClosed',
                defaultMessage:
                  'A line on a {status} order cannot be closed short',
              },
              { status: order.status },
            ),
          );
        }

        if (line.isClosedShort) {
          throw new ConflictException(
            t({
              id: 'orders.lineClosed',
              defaultMessage: 'That line is already closed',
            }),
          );
        }

        if (Number(line.quantityFulfilled) >= Number(line.quantityOrdered)) {
          throw new ConflictException(
            t({
              id: 'orders.lineCompleteThereNothing',
              defaultMessage:
                'That line is already complete — there is nothing outstanding to close',
            }),
          );
        }

        await tx
          .update(orderLines)
          .set({ isClosedShort: true, closedReason: input.reason })
          .where(eq(orderLines.id, lineId));

        this.logger.log(
          `Order ${orderId} line ${lineId} closed short at ${line.quantityFulfilled} of ${line.quantityOrdered}`,
        );

        return {
          organizationId,
          sku: line.sku,
          fulfilled: line.quantityFulfilled,
          ordered: line.quantityOrdered,
        };
      });

    /**
     * After the transaction, not inside it. emit uses its own connection, so
     * a notification written inside would survive a rollback and announce a
     * shortfall that was never recorded (ADR-036).
     */
    const recipients = await this.notifications.recipientsWith(
      organizationId,
      PERMISSIONS.ORDERS_UPDATE,
    );

    await this.notifications.emit(
      recipients.map((userId) => ({
        userId,
        organizationId,
        type: NOTIFICATION_TYPES.ORDER_LINE_CLOSED_SHORT,
        title: t(
          {
            id: 'notifications.closedShort.title',
            defaultMessage: '{sku} will not be delivered in full',
          },
          { sku },
        ),
        body: t(
          {
            id: 'notifications.closedShort.body',
            defaultMessage: '{fulfilled} of {ordered} received. {reason}',
          },
          { fulfilled, ordered, reason: input.reason },
        ),
        resourceType: 'order',
        resourceId: orderId,
      })),
    );
  }

  /**
   * A supplier finding stock after all is ordinary, and closing wrote no
   * movement — so this costs nothing and its absence would mean a database
   * edit the first time somebody mis-clicks (ADR-034).
   */
  async reopenLine(orderId: string, lineId: string): Promise<void> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const order = await loadOrder(tx, organizationId, orderId);
      const line = await this.loadLine(tx, orderId, lineId);

      if (order.status !== 'confirmed') {
        throw new ConflictException(
          t(
            {
              id: 'orders.lineStatusOrderReopened',
              defaultMessage: 'A line on a {status} order cannot be reopened',
            },
            { status: order.status },
          ),
        );
      }

      if (!line.isClosedShort) {
        throw new ConflictException(
          t({
            id: 'orders.lineClosed2',
            defaultMessage: 'That line is not closed',
          }),
        );
      }

      await tx
        .update(orderLines)
        .set({ isClosedShort: false, closedReason: null })
        .where(eq(orderLines.id, lineId));

      this.logger.log(`Order ${orderId} line ${lineId} reopened`);
    });
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

    if (!line)
      throw new NotFoundException(
        t({
          id: 'orders.suchLineOrder',
          defaultMessage: 'No such line on this order',
        }),
      );

    return line;
  }

  /**
   * Whatever the order's status. Below what has arrived is nonsense and above
   * it is a renegotiation that should be visible as one (ADR-033).
   */
  private assertNothingReceived(line: OrderLine, verb: string): void {
    if (Number(line.quantityFulfilled) > 0) {
      throw new ConflictException(
        t(
          {
            id: 'orders.quantityfulfilledReceivedAgainstItem',
            defaultMessage:
              '{quantityFulfilled} has already been received against this item, so it cannot be {verb}',
          },
          { quantityFulfilled: line.quantityFulfilled, verb },
        ),
      );
    }
  }
}
