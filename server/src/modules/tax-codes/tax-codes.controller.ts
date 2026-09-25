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
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { CreateTaxCodeDto } from './dto/create-tax-code.dto';
import { UpdateTaxCodeDto } from './dto/update-tax-code.dto';
import { TaxCodesService } from './tax-codes.service';

/**
 * The tax treatments an invoice line can carry (ADR-046).
 *
 * No delete, for the reason licences have none: an invoice line points at
 * the code it was drafted with. A code no longer charged is
 * `isActive: false`.
 */
@Controller({ path: 'tax-codes', version: '1' })
export class TaxCodesController {
  constructor(private readonly taxCodes: TaxCodesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TAX_CODES_VIEW)
  async list() {
    return { taxCodes: await this.taxCodes.list() };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.TAX_CODES_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.TAX_CODE_CREATED,
    resourceType: 'tax_code',
    resourceId: (response: { taxCode: { id: string } }) => response.taxCode.id,
    // The components are the point: "who set PST to 8%" is the question.
    fields: ['name', 'components'],
  })
  async create(@Body() dto: CreateTaxCodeDto) {
    return { taxCode: await this.taxCodes.create(dto) };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.TAX_CODES_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.TAX_CODE_UPDATED,
    resourceType: 'tax_code',
    resourceId: (_response, request) => request.params.id,
    fields: ['name', 'isActive', 'components'],
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxCodeDto,
  ): Promise<void> {
    await this.taxCodes.update(id, dto);
  }
}
