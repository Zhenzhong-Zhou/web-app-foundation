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
}
