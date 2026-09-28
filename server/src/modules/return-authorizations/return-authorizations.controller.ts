import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { CreateReturnAuthorizationDto } from './dto/create-return-authorization.dto';
import { ListReturnAuthorizationsDto } from './dto/list-return-authorizations.dto';
import { ReturnAuthorizationsService } from './return-authorizations.service';

/**
 * Return authorizations (ADR-047): raised, read, cancelled, closed.
 * Receiving against one is the returns route's; crediting one is the
 * credit notes'.
 *
 * Cancel and close are POSTs to actions, as ship, issue and void are: each
 * is an event with its own refusals, not a status someone edits.
 */
@Controller({ path: 'return-authorizations', version: '1' })
export class ReturnAuthorizationsController {
  constructor(private readonly rmas: ReturnAuthorizationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RETURN_AUTHORIZATIONS_VIEW)
  list(@Query() query: ListReturnAuthorizationsDto) {
    return this.rmas.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.RETURN_AUTHORIZATIONS_VIEW)
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { returnAuthorization: await this.rmas.findById(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.RETURN_AUTHORIZATIONS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.RETURN_AUTHORIZATION_CREATED,
    resourceType: 'return_authorization',
    resourceId: (response: { returnAuthorization: { id: string } }) =>
      response.returnAuthorization.id,
    // Not the reason or note: free text stays on the document (ADR-018).
    fields: ['orderId', 'invoiceId', 'expectsGoods', 'lines'],
  })
  async create(
    @Body() dto: CreateReturnAuthorizationDto,
    @CurrentUser() user: RequestContext,
  ) {
    return { returnAuthorization: await this.rmas.create(dto, user.userId) };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.RETURN_AUTHORIZATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.RETURN_AUTHORIZATION_CANCELLED,
    resourceType: 'return_authorization',
    resourceId: (_response, request) => request.params.id,
  })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestContext,
  ): Promise<void> {
    await this.rmas.cancel(id, user.userId);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.RETURN_AUTHORIZATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.RETURN_AUTHORIZATION_CLOSED,
    resourceType: 'return_authorization',
    resourceId: (_response, request) => request.params.id,
  })
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestContext,
  ): Promise<void> {
    await this.rmas.close(id, user.userId);
  }
}
