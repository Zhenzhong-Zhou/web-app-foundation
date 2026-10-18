import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { getRequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import type { NumberingEnvelope } from './dto/numbering-response.dto';
import { UpdateNumberingDto } from './dto/update-numbering.dto';
import { NumberingService } from './numbering.service';

/**
 * The Numbering section of Settings → Organization → Documents (ADR-073):
 * every member reads it, as every tab but Branding (ADR-061); those who may
 * change the organization's settings change it.
 */
@Controller({ path: 'organization/numbering', version: '1' })
export class NumberingController {
  constructor(private readonly numbering: NumberingService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_VIEW)
  async get(): Promise<NumberingEnvelope> {
    return { numbering: await this.numbering.get() };
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.ORGANIZATION_NUMBERING_UPDATED,
    resourceType: 'organization',
    resourceId: (_response, request) =>
      getRequestContext(request)?.organizationId ?? undefined,
    // Each series as stored before and after: the body is taken as sent,
    // never tidied, so what it says is what was saved (#133).
    fields: [
      'invoice',
      'creditNote',
      'returnAuthorization',
      'saleOrder',
      'purchaseOrder',
      'documentsInDateOrder',
    ],
  })
  async update(@Body() dto: UpdateNumberingDto): Promise<void> {
    await this.numbering.update(dto);
  }
}
