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
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { PartnerContactsService } from './partner-contacts.service';

@Controller({ path: 'partners/:partnerId/contacts', version: '1' })
export class PartnerContactsController {
  constructor(private readonly contacts: PartnerContactsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PARTNERS_VIEW)
  list(@Param('partnerId', ParseUUIDPipe) partnerId: string) {
    return this.contacts.list(partnerId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PARTNERS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PARTNER_CONTACT_CREATED,
    resourceType: 'partner',
    resourceId: (_response, request) => request.params.partnerId,
  })
  async create(
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Body() dto: CreateContactDto,
  ) {
    return { contact: await this.contacts.create(partnerId, dto) };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PARTNERS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PARTNER_CONTACT_UPDATED,
    resourceType: 'partner',
    resourceId: (_response, request) => request.params.partnerId,
  })
  async update(
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<void> {
    await this.contacts.update(partnerId, id, dto);
  }

  /**
   * DELETE, but the row survives: a contact may be named on an order that has
   * already shipped, so this retires rather than removes. The verb matches
   * what the caller means — "take this person off the list" — and the
   * difference from the address route above is deliberate, not an oversight.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PARTNERS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PARTNER_CONTACT_RETIRED,
    resourceType: 'partner',
    resourceId: (_response, request) => request.params.partnerId,
  })
  async retire(
    @Param('partnerId', ParseUUIDPipe) partnerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.contacts.retire(partnerId, id);
  }
}
