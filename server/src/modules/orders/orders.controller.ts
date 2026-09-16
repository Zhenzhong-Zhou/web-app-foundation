import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { ReceiveLineDto } from './dto/receive-line.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /**
   * Query rather than body, so a filtered list is a URL someone can bookmark
   * and a back button can restore.
   */
  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  list(@Query() query: ListOrdersDto) {
    return this.orders.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  find(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ORDERS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.ORDER_CREATED,
    resourceType: 'order',
    resourceId: (response: { order: { id: string } }) => response.order.id,
  })
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: RequestContext,
  ) {
    return { order: await this.orders.create(dto, user.userId) };
  }

  /**
   * Requires orders.create, not orders.update: this makes a new order, and
   * starting from an old one does not change what the caller ends up holding.
   *
   * Reuses ORDER_CREATED rather than its own action. What happened is that an
   * order came into existence; where its lines came from is on the row, in
   * duplicated_from_id, which is queryable in a way an audit payload is not.
   */
  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ORDERS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.ORDER_CREATED,
    resourceType: 'order',
    resourceId: (response: { order: { id: string } }) => response.order.id,
  })
  async duplicate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return { order: await this.orders.duplicate(id, user.userId) };
  }

  /**
   * Status changes come through here rather than through verbs like /confirm.
   * The service owns which transitions are legal, and a route per transition
   * would put half that table in the URL space.
   *
   * No DELETE. A cancelled order is a record of something that was intended
   * and then was not, which is worth keeping — and one that has been received
   * against cannot be removed without orphaning movements that reference it.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ORDERS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.ORDER_UPDATED,
    resourceType: 'order',
    resourceId: (_response, request) => request.params.id,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
  ): Promise<void> {
    await this.orders.update(id, dto);
  }

  /**
   * Its own permission, separate from orders.update.
   *
   * Writing to the ledger is a different act from renaming a reference, and
   * the person on the receiving dock is not usually the person who raises
   * orders. Whether one role holds both is the organization's decision, which
   * is what separate permissions are for.
   */
  @Post(':id/lines/:lineId/receipts')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ORDERS_RECEIVE)
  @Audited({
    action: AUDIT_ACTIONS.ORDER_LINE_RECEIVED,
    resourceType: 'order_line',
    resourceId: (_response, request) => request.params.lineId,
  })
  async receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: ReceiveLineDto,
    @CurrentUser() user: RequestContext,
  ) {
    return {
      movement: await this.orders.receive(id, lineId, dto, user.userId),
    };
  }
}
