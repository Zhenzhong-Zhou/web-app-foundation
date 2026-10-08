import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
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
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { ListPriceListsDto } from './dto/list-price-lists.dto';
import { SetPriceListItemDto } from './dto/set-price-list-item.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto';
import { PRICE_LIST_COLUMNS } from './price-list-exports';
import { PriceListsService } from './price-lists.service';

/**
 * Price lists (ADR-049). Owner-only by default: using a list needs none of
 * these, since a list price reaches a line through the order routes.
 */
@Controller({ path: 'price-lists', version: '1' })
export class PriceListsController {
  constructor(private readonly priceLists: PriceListsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_VIEW)
  async list(@Query() query: ListPriceListsDto) {
    return { priceLists: await this.priceLists.list(query) };
  }

  /** One price list's items as CSV (ADR-057), to send a customer. */
  @Get(':id/export')
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_VIEW)
  @Audited({
    action: AUDIT_ACTIONS.LIST_EXPORTED,
    resourceType: 'price_list',
    resourceId: (_response, request) => request.params.id,
  })
  async exportPriceList(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const list = await this.priceLists.findById(id);
    const rows = withinLimit(
      list.items.map((item) => ({ ...item, currency: list.currency })),
    );
    recordContext({ list: 'price_list', filters: { id }, rows: rows.length });
    return csvFile(
      res,
      'price-list',
      PRICE_LIST_COLUMNS,
      rows,
      localeOf(acceptLanguage),
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_VIEW)
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return { priceList: await this.priceLists.findById(id) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.PRICE_LIST_CREATED,
    resourceType: 'price_list',
    resourceId: (response: { priceList: { id: string } }) =>
      response.priceList.id,
    fields: ['name', 'direction', 'currency'],
  })
  async create(@Body() dto: CreatePriceListDto) {
    return { priceList: await this.priceLists.create(dto) };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PRICE_LIST_UPDATED,
    resourceType: 'price_list',
    resourceId: (_response, request) => request.params.id,
    fields: ['name', 'isActive'],
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePriceListDto,
  ) {
    await this.priceLists.update(id, dto);
  }

  @Put(':id/items/:variantId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PRICE_LIST_ITEM_SET,
    resourceType: 'price_list',
    resourceId: (_response, request) => request.params.id,
    fields: ['unitPrice'],
  })
  async setItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: SetPriceListItemDto,
  ) {
    return { item: await this.priceLists.setItem(id, variantId, dto) };
  }

  @Delete(':id/items/:variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PRICE_LISTS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.PRICE_LIST_ITEM_REMOVED,
    resourceType: 'price_list',
    resourceId: (_response, request) => request.params.id,
  })
  async removeItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    await this.priceLists.removeItem(id, variantId);
  }
}
