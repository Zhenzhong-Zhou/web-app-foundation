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
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  list() {
    return this.products.list();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  find(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.findById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCT_CREATED,
    resourceType: 'product',
    resourceId: (response: { product: { id: string } }) => response.product.id,
  })
  async create(@Body() dto: CreateProductDto) {
    return { product: await this.products.create(dto) };
  }

  /**
   * Discontinuing is an update, not a delete: a product whose variants have
   * movement history cannot be removed without inventing gaps in the ledger.
   * There is no products.delete permission for the same reason.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCT_UPDATED,
    resourceType: 'product',
    resourceId: (_response, request) => request.params.id,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<void> {
    await this.products.update(id, dto);
  }
}
