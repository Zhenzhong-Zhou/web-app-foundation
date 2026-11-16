import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { csvFile, everyRow, exportFilters } from '../../common/export';
import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { recordContext } from '../../core/audit/audit-context';
import { Audited } from '../../core/audit/audited.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { PermissionsService } from '../../core/authorization/permissions.service';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { AcceptLanguage } from '../../i18n/accept-language.decorator';
import { localeOf } from '../../i18n/translate';
import {
  ListStockByCodeDto,
  ListStockByLotDto,
  StockFiltersDto,
  StockPlacesDto,
} from './dto/list-stock-grouped.dto';
import type {
  StockCodeCounts,
  StockCodePage,
  StockCodePlaces,
  StockLotPage,
} from './dto/stock-grouped-response.dto';
import { STOCK_CODE_COLUMNS, STOCK_LOT_COLUMNS } from './stock-exports';
import { StockGroupedService } from './stock-grouped.service';

/**
 * Inventory's grouped read (ADR-093): a row per code, its counts, a
 * code's places and their lots, and the Lot view, each with its export,
 * beside `GET /v1/stock` until nothing reads that (R22). Each needs
 * `stock.view`; a place's name goes only to a reader with
 * `locations.view`, left out of the same answer for the rest (ADR-080;
 * A6).
 */
@Controller({ path: 'stock', version: '1' })
export class StockGroupedController {
  constructor(
    private readonly grouped: StockGroupedService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get('by-code')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  byCode(
    @Query() query: ListStockByCodeDto,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<StockCodePage> {
    return this.grouped.byCode(query, localeOf(acceptLanguage));
  }

  /** The codes each quick filter shows, beside its button (R3). */
  @Get('by-code/counts')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  counts(@Query() query: StockFiltersDto): Promise<StockCodeCounts> {
    return this.grouped.counts(query);
  }

  /** Every code the filters match, as CSV (ADR-057): the list's own query, every page. */
  @Get('by-code/export')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Audited({ action: AUDIT_ACTIONS.LIST_EXPORTED, resourceType: 'inventory' })
  async exportByCode(
    @Query() query: ListStockByCodeDto,
    @Res({ passthrough: true }) res: Response,
    @AcceptLanguage() acceptLanguage?: string,
  ) {
    // The base names, as every CSV keeps them (ADR-056).
    const rows = await everyRow((before, limit) =>
      this.grouped.byCode({ ...query, before, limit }, null),
    );
    recordContext({
      list: 'inventory',
      filters: exportFilters(query),
      rows: rows.length,
    });
    return csvFile(
      res,
      'inventory',
      STOCK_CODE_COLUMNS,
      rows,
      localeOf(acceptLanguage),
    );
  }

  /** A code's places and their lots, read as its row opens (R2). */
  @Get('by-code/:variantId/places')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  async places(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Query() query: StockPlacesDto,
    @CurrentUser() user: RequestContext,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<StockCodePlaces> {
    return this.grouped.places(
      variantId,
      query,
      localeOf(acceptLanguage),
      await this.seesPlaces(user),
    );
  }

  /** The Lot view: a row per lot at each place, soonest first (R4). */
  @Get('by-lot')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  async byLot(
    @Query() query: ListStockByLotDto,
    @CurrentUser() user: RequestContext,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<StockLotPage> {
    return this.grouped.byLot(
      query,
      localeOf(acceptLanguage),
      await this.seesPlaces(user),
    );
  }

  /** Every lot the filters match, as CSV (ADR-057): the list's own query, every page. */
  @Get('by-lot/export')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Audited({ action: AUDIT_ACTIONS.LIST_EXPORTED, resourceType: 'inventory' })
  async exportByLot(
    @Query() query: ListStockByLotDto,
    @CurrentUser() user: RequestContext,
    @Res({ passthrough: true }) res: Response,
    @AcceptLanguage() acceptLanguage?: string,
  ) {
    const seesPlaces = await this.seesPlaces(user);
    // The base names, as every CSV keeps them (ADR-056).
    const rows = await everyRow((before, limit) =>
      this.grouped.byLot({ ...query, before, limit }, null, seesPlaces),
    );
    recordContext({
      list: 'inventory-lots',
      filters: exportFilters(query),
      rows: rows.length,
    });
    return csvFile(
      res,
      'inventory-lots',
      STOCK_LOT_COLUMNS,
      rows,
      localeOf(acceptLanguage),
    );
  }

  /** Whether the reader may see places, and so their names (ADR-080). */
  private async seesPlaces(user: RequestContext): Promise<boolean> {
    const held = await this.permissions.heldBy(user.membershipId);
    return held.has(PERMISSIONS.LOCATIONS_VIEW);
  }
}
