import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { csvFile, exportFilters, withinLimit } from '../../common/export';
import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { recordContext } from '../../core/audit/audit-context';
import { Audited } from '../../core/audit/audited.decorator';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { AcceptLanguage } from '../../i18n/accept-language.decorator';
import { localeOf } from '../../i18n/translate';
import { ListReorderPointsDto } from './dto/list-reorder-points.dto';
import type {
  ReorderPointCounts,
  ReorderPointDetail,
  ReorderPointPage,
  ReorderPointPreview,
} from './dto/reorder-point-response.dto';
import { SetReorderPointDto } from './dto/set-reorder-point.dto';
import { ReorderPointsService } from './reorder-points.service';
import { ReorderPointsReadsService } from './reorder-points-reads.service';
import { REORDER_POINT_COLUMNS } from './stock-exports';

/**
 * An item's reorder point (ADR-085), by the item's id, since an item has
 * one at most: a variant not this organization's is not found, as any
 * path id is. Each write answers 204, since the list reads again after
 * any of them: its counts and its order change with the point.
 *
 * Audited by the item, so a removed point keeps its SKU in the log.
 *
 * The reads need only stock.view: the list of every item with a point
 * and where it stands, its counts, its CSV and an opened row's lines;
 * the dialog's preview needs stock.reorder, as its writes do.
 * Declared before the item's own route, which would take "counts" for
 * an id.
 */
@Controller({ path: 'stock/reorder-points', version: '1' })
export class ReorderPointsController {
  constructor(
    private readonly reorderPoints: ReorderPointsService,
    private readonly reads: ReorderPointsReadsService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  list(
    @Query() query: ListReorderPointsDto,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<ReorderPointPage> {
    return this.reads.list(query, localeOf(acceptLanguage));
  }

  /** Beside All, Low and Out (ADR-055): the list's search, its filter left off. */
  @Get('counts')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  counts(@Query() query: ListReorderPointsDto): Promise<ReorderPointCounts> {
    return this.reads.counts(query);
  }

  /** The list as its filter and search narrow it, as CSV (ADR-057): its own query, in one read. */
  @Get('export')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Audited({
    action: AUDIT_ACTIONS.LIST_EXPORTED,
    resourceType: 'reorder_points',
  })
  async exportReorderPoints(
    @Query() query: ListReorderPointsDto,
    @Res({ passthrough: true }) res: Response,
    @AcceptLanguage() acceptLanguage?: string,
  ) {
    const rows = withinLimit(await this.reads.exportRows(query));
    recordContext({
      list: 'reorder_points',
      filters: exportFilters(query),
      rows: rows.length,
    });
    return csvFile(
      res,
      'reorder-points',
      REORDER_POINT_COLUMNS,
      rows,
      localeOf(acceptLanguage),
    );
  }

  /** An opened row's lines: where its usable, coming and still needed are. */
  @Get(':variantId')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  detail(
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ): Promise<ReorderPointDetail> {
    return this.reads.detail(variantId);
  }

  /**
   * The dialog's Today (ADR-085): what the values typed would make of the
   * item, worked out as the list will once they are saved, and refused as
   * saving refuses them. The dialog's own read, so its write's permission.
   */
  @Get(':variantId/preview')
  @RequirePermissions(PERMISSIONS.STOCK_REORDER)
  preview(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Query() query: SetReorderPointDto,
  ): Promise<ReorderPointPreview> {
    return this.reads.preview(variantId, query);
  }

  @Post(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.STOCK_REORDER)
  @Audited({
    action: AUDIT_ACTIONS.REORDER_POINT_CREATED,
    resourceType: 'reorder_point',
    resourceId: (_response, request) => request.params.variantId,
  })
  async create(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: SetReorderPointDto,
  ): Promise<void> {
    await this.reorderPoints.create(variantId, dto);
  }

  @Put(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.STOCK_REORDER)
  @Audited({
    action: AUDIT_ACTIONS.REORDER_POINT_UPDATED,
    resourceType: 'reorder_point',
    resourceId: (_response, request) => request.params.variantId,
    // No fields from the body: the service records what was kept, before
    // and after, as adding does (ADR-018).
  })
  async update(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: SetReorderPointDto,
  ): Promise<void> {
    await this.reorderPoints.update(variantId, dto);
  }

  @Delete(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.STOCK_REORDER)
  @Audited({
    action: AUDIT_ACTIONS.REORDER_POINT_REMOVED,
    resourceType: 'reorder_point',
    resourceId: (_response, request) => request.params.variantId,
  })
  async remove(
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ): Promise<void> {
    await this.reorderPoints.remove(variantId);
  }
}
