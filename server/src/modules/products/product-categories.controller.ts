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
import {
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
} from './dto/product-category.dto';
import type {
  ProductCategoryEnvelope,
  ProductCategoryList,
} from './dto/product-category-response.dto';
import { ProductCategoriesService } from './product-categories.service';

/**
 * Items' categories (ADR-092), read by whoever may see items and managed
 * by whoever may change them: a category is part of the catalogue, as an
 * item's name is. Each change is recorded by the category's name.
 *
 * Registered before ProductsController (products.module.ts): Nest matches
 * routes in the order they are registered, and `GET /products/:id` would
 * otherwise take `categories` for an id and refuse it as one.
 */
@Controller({ path: 'products/categories', version: '1' })
export class ProductCategoriesController {
  constructor(private readonly categories: ProductCategoriesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  list(): Promise<ProductCategoryList> {
    return this.categories.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCT_CATEGORY_CREATED,
    resourceType: 'product_category',
    resourceId: (response: ProductCategoryEnvelope) => response.category.id,
    fields: ['name', 'parentId'],
  })
  async create(
    @Body() dto: CreateProductCategoryDto,
  ): Promise<ProductCategoryEnvelope> {
    return { category: await this.categories.create(dto) };
  }

  /** Renamed or moved; the screen reads the tree again (ADR-068). */
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCT_CATEGORY_UPDATED,
    resourceType: 'product_category',
    resourceId: (_response, request) => request.params.id,
    fields: ['name', 'parentId'],
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductCategoryDto,
  ): Promise<void> {
    await this.categories.update(id, dto);
  }

  /** Only an empty one; the entry keeps its name, which outlives it. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCT_CATEGORY_DELETED,
    resourceType: 'product_category',
    resourceId: (_response, request) => request.params.id,
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.categories.remove(id);
  }
}
