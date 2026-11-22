import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { PermissionsService } from '../../core/authorization/permissions.service';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import type {
  LotTrackingQuestion,
  LotTrackingStarted,
} from './dto/lot-tracking-response.dto';
import { StartLotTrackingDto } from './dto/start-lot-tracking.dto';
import { LotTrackingService } from './lot-tracking.service';

/**
 * Start tracking lots, on the item's page (ADR-094, R13 to R18): for
 * whoever may change items and correct counts, both, since it changes the
 * code for good and moves its stock into a lot. Under the item's path, as
 * its codes' other changes are, and recorded in its History.
 */
@Controller({
  path: 'products/:id/variants/:variantId/lot-tracking',
  version: '1',
})
export class LotTrackingController {
  constructor(
    private readonly lotTracking: LotTrackingService,
    private readonly permissions: PermissionsService,
  ) {}

  /** What the question says: where the stock is, and the runs it touches. */
  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE, PERMISSIONS.STOCK_ADJUST)
  async question(
    @Param('id', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @CurrentUser() user: RequestContext,
  ): Promise<LotTrackingQuestion> {
    // A run by its reference only for a reader who may see runs, as
    // Movements and Where it stands name them (ADR-080); the count for all.
    const held = await this.permissions.heldBy(user.membershipId);
    return this.lotTracking.question(productId, variantId, {
      runs: held.has(PERMISSIONS.PRODUCTION_VIEW),
    });
  }

  /** The one write: the code tracks lots, its stock and cost in one lot. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTS_UPDATE, PERMISSIONS.STOCK_ADJUST)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCT_LOT_TRACKING_STARTED,
    // The item, as a change to one of its codes is (ProductsController):
    // its History is where who started it, and when, is read (R16). The
    // service records the code and the lot made.
    resourceType: 'product',
    resourceId: (_response, request) => request.params.id,
  })
  start(
    @Param('id', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: StartLotTrackingDto,
    @CurrentUser() user: RequestContext,
  ): Promise<LotTrackingStarted> {
    return this.lotTracking.start(productId, variantId, dto, user.userId);
  }
}
