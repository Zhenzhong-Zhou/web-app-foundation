import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { PreviewShipmentDto, ShipOrderDto } from './dto/ship-order.dto';
import { VoidShipmentDto } from './dto/void-shipment.dto';
import { ShipmentsService } from './shipments.service';

/**
 * Shipments against a sales order (ADR-041). Its own controller because a
 * shipment is its own document — several lines, several lots, one parcel —
 * rather than an action on one order line the way a receipt is.
 */
@Controller({ path: 'orders/:id/shipments', version: '1' })
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipments.listForOrder(id);
  }

  /**
   * One shipment, with everything its packing slip prints. A read, so
   * orders.view: whoever can see the order can print what left against it.
   */
  @Get(':shipmentId')
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  slip(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
  ) {
    return this.shipments.slip(id, shipmentId);
  }

  /**
   * A POST because the question has a body — which lines, how much of each —
   * but it writes nothing. Its own permission rather than orders.view: it
   * shows exactly what shipping would take from the shelf.
   */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ORDERS_SHIP)
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreviewShipmentDto,
  ) {
    return this.shipments.preview(id, dto);
  }

  /**
   * Its own permission, as receiving has: the person packing boxes is not
   * usually the person who raises orders, and writing to the ledger is a
   * different act from editing a reference.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ORDERS_SHIP)
  @Audited({
    action: AUDIT_ACTIONS.ORDER_SHIPPED,
    resourceType: 'order',
    resourceId: (_response, request) => request.params.id,
  })
  async ship(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShipOrderDto,
    @CurrentUser() user: RequestContext,
  ) {
    return { shipment: await this.shipments.ship(id, dto, user.userId) };
  }

  /**
   * Undoes a shipment that was recorded before the box left (ADR-041).
   * orders.ship, because it is the same act run backwards by the same
   * person — the one who clicked Ship too early. Audited under the order, so
   * its History shows the shipment and its void side by side.
   */
  @Post(':shipmentId/void')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ORDERS_SHIP)
  @Audited({
    action: AUDIT_ACTIONS.ORDER_SHIPMENT_VOIDED,
    resourceType: 'order',
    resourceId: (_response, request) => request.params.id,
  })
  async void(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('shipmentId', ParseUUIDPipe) shipmentId: string,
    @Body() dto: VoidShipmentDto,
    @CurrentUser() user: RequestContext,
  ): Promise<void> {
    await this.shipments.void(id, shipmentId, dto, user.userId);
  }
}
