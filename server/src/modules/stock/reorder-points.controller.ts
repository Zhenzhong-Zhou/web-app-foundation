import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { SetReorderPointDto } from './dto/set-reorder-point.dto';
import { ReorderPointsService } from './reorder-points.service';

/**
 * An item's reorder point (ADR-085), by the item's id, since an item has
 * one at most: a variant not this organization's is not found, as any
 * path id is. Each write answers 204, since the list reads again after
 * any of them: its counts and its order change with the point.
 *
 * Audited by the item, so a removed point keeps its SKU in the log.
 */
@Controller({ path: 'stock/reorder-points', version: '1' })
export class ReorderPointsController {
  constructor(private readonly reorderPoints: ReorderPointsService) {}

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
    fields: [
      'source',
      'reorderPoint',
      'rule',
      'fixedQuantity',
      'maximumQuantity',
    ],
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
