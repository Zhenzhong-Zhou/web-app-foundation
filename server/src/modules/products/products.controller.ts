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
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductsService } from './products.service';

@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  list() {
    return this.products.list();
  }

  /**
   * Declared above @Get(':id') deliberately. Nest matches in declaration
   * order, and 'variants' would otherwise hit the id route — where
   * ParseUUIDPipe turns a working request into a 400 that reads like a
   * client bug rather than a routing mistake.
   *
   * Flat, across products, because stock hangs off variants (ADR-023): a
   * receiving screen needs SKUs with no product to drill into first.
   */
  @Get('variants')
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  listVariants() {
    return this.products.listActiveVariants();
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

  @Post(':id/variants')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCT_VARIANT_ADDED,
    // The product, not the variant — the partner-address precedent. The log
    // is read as a product's history, from the product page's History link,
    // and a variant id is a row nobody navigates to. The action already says
    // it was a variant.
    resourceType: 'product',
    resourceId: (_response, request) => request.params.id,
  })
  async addVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return { variant: await this.products.addVariant(id, dto) };
  }

  /**
   * products.update rather than a permission of its own: editing a variant is
   * editing the product, and a role that may rename one may rename the other.
   */
  @Patch(':id/variants/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCT_VARIANT_UPDATED,
    // The product, as above. Which variant is in the payload: the SKU is the
    // one field recorded, and it names the variant better than its id would.
    resourceType: 'product',
    resourceId: (_response, request) => request.params.id,
    // The case ADR-023 named: a rename affects the catalogue and nothing
    // historical, so the previous SKU is otherwise unrecoverable.
    fields: ['sku'],
  })
  async updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ): Promise<void> {
    await this.products.updateVariant(id, variantId, dto);
  }
}
