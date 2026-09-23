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
import { ReturnOrderDto } from './dto/return-order.dto';
import { ReturnsService } from './returns.service';

/**
 * Customer returns against a sales order (ADR-043).
 *
 * orders.receive rather than a permission of its own: taking goods back in
 * is receiving, done by the same person at the same dock, and it writes
 * inbound movements exactly as a receipt does.
 */
@Controller({ path: 'orders/:id/returns', version: '1' })
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.returns.listForOrder(id);
  }

  /** What can still come back, line by line and lot by lot. */
  @Get('returnable')
  @RequirePermissions(PERMISSIONS.ORDERS_RECEIVE)
  returnable(@Param('id', ParseUUIDPipe) id: string) {
    return this.returns.returnable(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ORDERS_RECEIVE)
  @Audited({
    action: AUDIT_ACTIONS.ORDER_RETURN_RECEIVED,
    resourceType: 'order',
    resourceId: (_response, request) => request.params.id,
  })
  async receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnOrderDto,
    @CurrentUser() user: RequestContext,
  ) {
    return { orderReturn: await this.returns.receive(id, dto, user.userId) };
  }
}
