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
import { CreateProductLicenceDto } from './dto/create-product-licence.dto';
import { UpdateProductLicenceDto } from './dto/update-product-licence.dto';
import { ProductLicencesService } from './product-licences.service';

/**
 * No delete, for the reason products and locations have none: a recipe that
 * was made under a licence keeps pointing at it, and that is what a recall
 * follows. Withdrawn or expired is `isActive: false`.
 */
@Controller({ path: 'product-licences', version: '1' })
export class ProductLicencesController {
  constructor(private readonly licences: ProductLicencesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCT_LICENCES_VIEW)
  list() {
    return this.licences.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCT_LICENCES_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCT_LICENCE_CREATED,
    resourceType: 'product_licence',
    resourceId: (response: { licence: { id: string } }) => response.licence.id,
    // The number and who issued it. Not the notes, which are free text.
    fields: ['number', 'authority'],
  })
  async create(@Body() dto: CreateProductLicenceDto) {
    return { licence: await this.licences.create(dto) };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PRODUCT_LICENCES_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCT_LICENCE_UPDATED,
    resourceType: 'product_licence',
    resourceId: (_response, request) => request.params.id,
    fields: ['number', 'authority', 'isActive', 'expiresAt'],
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductLicenceDto,
  ): Promise<void> {
    await this.licences.update(id, dto);
  }
}
