import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { csvFile, withinLimit } from '../../common/export';
import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { recordContext } from '../../core/audit/audit-context';
import { Audited } from '../../core/audit/audited.decorator';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { localeOf } from '../../i18n/translate';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { PARTNER_COLUMNS } from './partner-exports';
import { PartnersService } from './partners.service';

@Controller({ path: 'partners', version: '1' })
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PARTNERS_VIEW)
  list() {
    return this.partners.list();
  }

  /** Customers and suppliers as CSV (ADR-057). Above ':id'. */
  @Get('export')
  @RequirePermissions(PERMISSIONS.PARTNERS_VIEW)
  @Audited({ action: AUDIT_ACTIONS.LIST_EXPORTED, resourceType: 'partners' })
  async exportPartners(
    @Res({ passthrough: true }) res: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const rows = withinLimit(await this.partners.exportRows());
    recordContext({ list: 'partners', filters: {}, rows: rows.length });
    return csvFile(
      res,
      'partners',
      PARTNER_COLUMNS,
      rows,
      localeOf(acceptLanguage),
    );
  }

  /**
   * Returns the partner with its addresses and contacts embedded.
   *
   * The only consumer is the detail screen, and it wants all three — so this
   * is one request rather than an ?include= protocol built for a single
   * caller. The nested write routes stay as they are: read and write do not
   * have to be symmetrical.
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.PARTNERS_VIEW)
  find(@Param('id', ParseUUIDPipe) id: string) {
    return this.partners.findDetail(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PARTNERS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.PARTNER_CREATED,
    resourceType: 'partner',
    resourceId: (response: { partner: { id: string } }) => response.partner.id,
  })
  async create(@Body() dto: CreatePartnerDto) {
    return { partner: await this.partners.create(dto) };
  }

  /**
   * Retiring is an update, not a delete: a partner referenced by an order
   * cannot be removed without inventing gaps in the history the order exists to
   * record. There is no partners.delete permission for the same reason.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PARTNERS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PARTNER_UPDATED,
    resourceType: 'partner',
    resourceId: (_response, request) => request.params.id,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerDto,
  ): Promise<void> {
    await this.partners.update(id, dto);
  }
}
