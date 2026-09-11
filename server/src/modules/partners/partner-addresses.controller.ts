import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { PartnerAddressesService } from './partner-addresses.service';

/**
 * Nested under the partner rather than a flat /v1/addresses.
 *
 * The owner is then in the URL, so the service never guesses which foreign key
 * to set and a body cannot claim an owner it was not addressed to. It also
 * settles authorization: a flat route would have to read the body before it
 * knew which permission applied.
 *
 * No partners.addresses.* permissions. An address is part of the partner
 * record, not an independently governed thing — someone who may edit the
 * partner may edit where it ships. Four more keys would mean another seed run
 * in every environment for no decision anyone would make differently.
 */
@Controller({ path: 'partners/:partnerId/addresses', version: '1' })
export class PartnerAddressesController {
  constructor(private readonly addresses: PartnerAddressesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PARTNERS_VIEW)
  list(@Param('partnerId', ParseUUIDPipe) partnerId: string) {
    return this.addresses.list(partnerId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PARTNERS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PARTNER_ADDRESS_CREATED,
    resourceType: 'partner',
    // The partner, not the address: the audit log is read as the history of a
    // partner, and a resourceId naming a row the reader has never seen is a
    // dead end.
    resourceId: (_response, request) => request.params.partnerId,
  })
  async create(
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return { address: await this.addresses.create(partnerId, dto) };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PARTNERS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PARTNER_ADDRESS_UPDATED,
    resourceType: 'partner',
    resourceId: (_response, request) => request.params.partnerId,
  })
  async update(
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<void> {
    await this.addresses.update(partnerId, id, dto);
  }

  /**
   * A real delete, unlike every other resource in this codebase. Nothing
   * references an address — the order keeps its own snapshot of where it went
   * (ADR-028) — so there is no history to preserve by retiring it instead.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PARTNERS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PARTNER_ADDRESS_RETIRED,
    resourceType: 'partner',
    resourceId: (_response, request) => request.params.partnerId,
  })
  async retire(
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.addresses.retire(partnerId, id);
  }
}
