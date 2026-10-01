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
import { LinkReturnDto } from './dto/link-return.dto';
import { ListReturnAuthorizationsDto } from './dto/list-return-authorizations.dto';
import { ReturnAuthorizationReceiptsService } from './return-authorization-receipts.service';
import { ReturnAuthorizationReplacementsService } from './return-authorization-replacements.service';
import { ReturnAuthorizationsService } from './return-authorizations.service';

/**
 * Return authorizations (ADR-047): raised, read, cancelled, closed, and a
 * return received without one linked to it afterwards. Receiving against
 * one is the returns route's; crediting one is the credit notes'.
 *
 * Cancel and close are POSTs to actions, as ship, issue and void are: each
 * is an event with its own refusals, not a status someone edits.
 */
@Controller({ path: 'return-authorizations', version: '1' })
export class ReturnAuthorizationsController {
  constructor(
    private readonly rmas: ReturnAuthorizationsService,
    private readonly receipts: ReturnAuthorizationReceiptsService,
    private readonly replacements: ReturnAuthorizationReplacementsService,
  ) {}

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

  /**
   * Counts a return already received against this RMA. Customer service's
   * act, not the dock's: deciding that goods which arrived unannounced were
   * the ones agreed to.
   */
  @Post(':id/returns')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.RETURN_AUTHORIZATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.RETURN_AUTHORIZATION_RETURN_LINKED,
    resourceType: 'return_authorization',
    resourceId: (_response, request) => request.params.id,
    fields: ['returnId'],
  })
  async linkReturn(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkReturnDto,
  ): Promise<void> {
    await this.receipts.linkReturn(id, dto.returnId);
  }

  /**
   * A draft sale at zero for the lines resolved as replace. Customer
   * service's act, as the RMA is; the order is then confirmed and shipped
   * as any sale, by whoever does that.
   */
  @Post(':id/replacement')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.RETURN_AUTHORIZATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.RETURN_AUTHORIZATION_REPLACEMENT_RAISED,
    resourceType: 'return_authorization',
    resourceId: (_response, request) => request.params.id,
  })
  async raiseReplacement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return { order: await this.replacements.raiseReplacement(id, user.userId) };
  }
}
