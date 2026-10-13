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
  Query,
  UseGuards,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { movementOf } from '../stock/movement-view';
import {
  CreateProductionOrderDto,
  ListProductionOrdersDto,
  UpdateProductionOrderDto,
} from './dto/production-order.dto';
import type {
  CancelledRun,
  ClosedRun,
  IssuePlan,
  OutputEnvelope,
  ProductionOrderEnvelope,
  ReleasedRun,
  RunDetail,
  RunPage,
} from './dto/production-order-response.dto';
import {
  CancelProductionOrderDto,
  CloseProductionOrderDto,
  IssuePlanQueryDto,
  RecordOutputDto,
  ReleaseProductionOrderDto,
} from './dto/transitions.dto';
import { LicenceOverrideGuard } from './licence-override.guard';
import { ProductionCloseService } from './production-close.service';
import { ProductionExecutionService } from './production-execution.service';
import { ProductionOrdersService } from './production-orders.service';
import { runLineOf } from './run-views';

@Controller({ path: 'production-orders', version: '1' })
export class ProductionOrdersController {
  constructor(
    private readonly runs: ProductionOrdersService,
    private readonly execution: ProductionExecutionService,
    private readonly closing: ProductionCloseService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTION_VIEW)
  list(@Query() query: ListProductionOrdersDto): Promise<RunPage> {
    return this.runs.list(query);
  }

  /** The run, its lines with planned against consumed, and its output lots. */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTION_VIEW)
  find(@Param('id', ParseUUIDPipe) id: string): Promise<RunDetail> {
    return this.runs.findDetail(id);
  }

  /**
   * What releasing from a source would issue, lot by lot, without moving
   * anything. Release's permission, since it shows exactly what release
   * would take (ADR-039).
   */
  @Get(':id/issue-plan')
  @RequirePermissions(PERMISSIONS.PRODUCTION_RELEASE)
  issuePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: IssuePlanQueryDto,
  ): Promise<IssuePlan> {
    return this.runs.issuePlan(id, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTION_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCTION_ORDER_CREATED,
    resourceType: 'production_order',
    resourceId: (response: { productionOrder: { id: string } }) =>
      response.productionOrder.id,
  })
  async create(
    @Body() dto: CreateProductionOrderDto,
  ): Promise<ProductionOrderEnvelope> {
    const created = await this.runs.create(dto);
    return { productionOrder: await this.runs.findDetail(created.id) };
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.PRODUCTION_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCTION_ORDER_UPDATED,
    resourceType: 'production_order',
    resourceId: (_response, request) => request.params.id,
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductionOrderDto,
  ): Promise<void> {
    await this.runs.update(id, dto);
  }

  /**
   * Issues components and freezes the recipe onto the run.
   *
   * Its own permission, separate from planning: releasing moves stock, and the
   * person who plans a week of runs is not always the person allowed to empty
   * a shelf into one.
   *
   * Overriding the licence policy needs production.override_licence as
   * well, but only when the body carries an override (ADR-050).
   */
  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.PRODUCTION_RELEASE)
  @UseGuards(LicenceOverrideGuard)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCTION_ORDER_RELEASED,
    resourceType: 'production_order',
    resourceId: (_response, request) => request.params.id,
  })
  async release(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReleaseProductionOrderDto,
    @CurrentUser() user: RequestContext,
  ): Promise<ReleasedRun> {
    const lines = await this.execution.release(id, dto, user.userId);
    return { lines: lines.map(runLineOf) };
  }

  /** Repeatable: a batch spanning days posts here more than once. */
  @Post(':id/output')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.PRODUCTION_COMPLETE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCTION_ORDER_OUTPUT_RECORDED,
    resourceType: 'production_order',
    resourceId: (_response, request) => request.params.id,
  })
  async recordOutput(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordOutputDto,
    @CurrentUser() user: RequestContext,
  ): Promise<OutputEnvelope> {
    const movement = await this.execution.recordOutput(id, dto, user.userId);
    return { movement: movementOf(movement) };
  }

  /**
   * Returns 200 with the lines that ran over the flag threshold rather than
   * 204, because the variance is the thing worth seeing and the moment of
   * closing is when someone can act on it (ADR-032). The same figures land in
   * the audit payload.
   */
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.PRODUCTION_COMPLETE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCTION_ORDER_CLOSED,
    resourceType: 'production_order',
    resourceId: (_response, request) => request.params.id,
  })
  async close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseProductionOrderDto,
    @CurrentUser() user: RequestContext,
  ): Promise<ClosedRun> {
    return this.closing.close(id, dto, user.userId);
  }

  /**
   * Returns the lines still holding issued material, so the response says what
   * a person has to go and put away. Nothing is unwound: the material is
   * physically at the run's location, and a reversing movement would claim
   * somebody moved it back.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.PRODUCTION_RELEASE)
  @Audited({
    action: AUDIT_ACTIONS.PRODUCTION_ORDER_CANCELLED,
    resourceType: 'production_order',
    resourceId: (_response, request) => request.params.id,
  })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelProductionOrderDto,
  ): Promise<CancelledRun> {
    const { strandedLines } = await this.runs.cancel(id, dto);
    return { strandedLines: strandedLines.map(runLineOf) };
  }
}
