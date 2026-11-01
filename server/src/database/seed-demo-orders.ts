import type { INestApplicationContext } from '@nestjs/common';

import { AUDIT_ACTIONS } from '../core/audit/audit-actions';
import type { CloseLineDto } from '../modules/orders/dto/close-line.dto';
import type { CreateOrderDto } from '../modules/orders/dto/create-order.dto';
import type { ReceiveLineDto } from '../modules/orders/dto/receive-line.dto';
import type { ReturnOrderDto } from '../modules/orders/dto/return-order.dto';
import type { ShipOrderDto } from '../modules/orders/dto/ship-order.dto';
import type { UpdateOrderDto } from '../modules/orders/dto/update-order.dto';
import type { VoidShipmentDto } from '../modules/orders/dto/void-shipment.dto';
import { OrderLifecycleService } from '../modules/orders/order-lifecycle.service';
import { OrderLinesService } from '../modules/orders/order-lines.service';
import { OrderReceiptsService } from '../modules/orders/order-receipts.service';
import { ReturnsService } from '../modules/orders/returns.service';
import { ShipmentVoidsService } from '../modules/orders/shipment-voids.service';
import { ShippingService } from '../modules/orders/shipping.service';
import type { Audited } from './seed-demo-audit';

/**
 * The Owner's steps on the demo's own orders (seed-demo.ts,
 * seed-demo-variety.ts), each written to the order's History when it
 * happens, as its route's @Audited() writes it (#222). So SO-DEMO-1 reads
 * created, confirmed, shipped, in that order, and the opening history,
 * written after, leaves these orders alone (seed-demo-audit.ts). The
 * team's orders have their own steps (seed-demo-team-work.ts).
 */
export function orderSteps(
  app: INestApplicationContext,
  audited: Audited,
  actor: string,
) {
  const orders = app.get(OrderLifecycleService);
  const lines = app.get(OrderLinesService);
  const receipts = app.get(OrderReceiptsService);
  const shipping = app.get(ShippingService);
  const returns = app.get(ReturnsService);
  const voids = app.get(ShipmentVoidsService);

  return {
    create(input: CreateOrderDto) {
      return audited(
        actor,
        {
          action: AUDIT_ACTIONS.ORDER_CREATED,
          type: 'order',
          id: (order: { id: string }) => order.id,
        },
        () => orders.create(input, actor),
      );
    },

    setStatus(orderId: string, status: NonNullable<UpdateOrderDto['status']>) {
      return audited(
        actor,
        {
          action: AUDIT_ACTIONS.ORDER_UPDATED,
          type: 'order',
          id: orderId,
          body: { status },
          fields: ['status', 'reference', 'expectedAt', 'deliverToId'],
        },
        () => orders.update(orderId, { status }),
      );
    },

    receive(orderId: string, lineId: string, input: ReceiveLineDto) {
      return audited(
        actor,
        {
          action: AUDIT_ACTIONS.ORDER_LINE_RECEIVED,
          type: 'order',
          id: orderId,
          body: input,
          fields: ['quantity'],
        },
        () => receipts.receive(orderId, lineId, input, actor),
      );
    },

    closeLineShort(orderId: string, lineId: string, input: CloseLineDto) {
      return audited(
        actor,
        {
          action: AUDIT_ACTIONS.ORDER_LINE_CLOSED_SHORT,
          type: 'order',
          id: orderId,
        },
        () => lines.closeLineShort(orderId, lineId, input),
      );
    },

    ship(orderId: string, input: ShipOrderDto) {
      return audited(
        actor,
        { action: AUDIT_ACTIONS.ORDER_SHIPPED, type: 'order', id: orderId },
        () => shipping.ship(orderId, input, actor),
      );
    },

    voidShipment(orderId: string, shipmentId: string, input: VoidShipmentDto) {
      return audited(
        actor,
        {
          action: AUDIT_ACTIONS.ORDER_SHIPMENT_VOIDED,
          type: 'order',
          id: orderId,
        },
        () => voids.void(orderId, shipmentId, input, actor),
      );
    },

    receiveReturn(orderId: string, input: ReturnOrderDto) {
      return audited(
        actor,
        {
          action: AUDIT_ACTIONS.ORDER_RETURN_RECEIVED,
          type: 'order',
          id: orderId,
        },
        () => returns.receive(orderId, input, actor),
      );
    },
  };
}
