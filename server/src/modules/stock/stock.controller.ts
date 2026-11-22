import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { csvFile, everyRow, exportFilters } from '../../common/export';
import { reportFault } from '../../common/faults/tracker';
import { AuditService } from '../../core/audit/audit.service';
import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { recordContext } from '../../core/audit/audit-context';
import { Audited } from '../../core/audit/audited.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { PermissionsService } from '../../core/authorization/permissions.service';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { requestTimeZone } from '../../database/tenant-context';
import { AcceptLanguage } from '../../i18n/accept-language.decorator';
import { localeOf } from '../../i18n/translate';
import { AdjustmentGuard } from './adjustment.guard';
import { ListLotsDto } from './dto/list-lots.dto';
import { ListMovementsDto } from './dto/list-movements.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import type {
  Lot,
  MovementPage,
  MovementPeriod,
  RecordedMovementEnvelope,
  StockVariant,
} from './dto/stock-response.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { LotsService } from './lots.service';
import { cardOf, movementOf, type MovementSight } from './movement-view';
import { StockService } from './stock.service';
import { movementColumns, movementLines } from './stock-exports';
import { StockReadsService } from './stock-reads.service';

/**
 * One endpoint for every kind of movement, not one per reason.
 *
 * A /receive and a /ship would differ only in which location column they fill
 * and would each need the same lot check, leaf check, lock ordering, and
 * constraint handling. Two write paths into a ledger is the shape ADR-023
 * rules out — the moment a second one exists, "every change is a movement"
 * stops being true by construction and starts being true by convention.
 *
 * No PATCH and no DELETE. The ledger is append-only: a receipt entered wrongly
 * is corrected by an adjustment that says so, which is the entire reason a
 * ledger can answer "why does the system say 47 when the shelf holds 45".
 */
@Controller({ path: 'stock', version: '1' })
export class StockController {
  private readonly logger = new Logger(StockController.name);

  constructor(
    private readonly stock: StockService,
    private readonly reads: StockReadsService,
    private readonly lots: LotsService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
  ) {}

  @Post('movements')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.STOCK_MOVE)
  @UseGuards(AdjustmentGuard)
  @Audited({
    action: AUDIT_ACTIONS.STOCK_MOVEMENT_RECORDED,
    resourceType: 'stock_movement',
    resourceId: (response: { movement: { id: string } }) =>
      response.movement.id,
  })
  async record(
    @Body() dto: RecordMovementDto,
    @CurrentUser() user: RequestContext,
  ): Promise<RecordedMovementEnvelope> {
    /**
     * @Audited sits above this and does not replace it. The movement carries
     * actor_id itself and not-null (ADR-023): a manual adjustment with no name
     * attached is precisely the row someone will ask about, and the audit log
     * answers a different question with a different retention.
     */
    const recorded = await this.stock.record(dto, user.userId);
    return {
      movement: movementOf(recorded),
      needsCost: recorded.needsCost,
      lotCode: recorded.lotCode,
    };
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  async listMovements(
    @Query() query: ListMovementsDto,
    @CurrentUser() user: RequestContext,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<MovementPage> {
    return this.reads.listMovements(
      query,
      localeOf(acceptLanguage),
      await this.sightOf(user, query),
    );
  }

  /**
   * Every movement the filters match, as CSV (ADR-057): the list's own
   * query, every page, oldest first, with the reader's sight (ADR-093,
   * 87a, 88a and 96a).
   */
  @Get('movements/export')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Audited({ action: AUDIT_ACTIONS.LIST_EXPORTED, resourceType: 'movements' })
  async exportMovements(
    @Query() query: ListMovementsDto,
    @CurrentUser() user: RequestContext,
    @Res({ passthrough: true }) res: Response,
    @AcceptLanguage() acceptLanguage?: string,
  ) {
    // What the reader may see, as the list reads it, an order's movements
    // refused as the list refuses them.
    const sight = await this.sightOf(user, query);
    // The base names, as every CSV keeps them (ADR-056); oldest first,
    // as a stock card reads (87a). The period is the same on every page.
    let period: MovementPeriod | null = null;
    const rows = await everyRow(async (before, limit) => {
      const page = await this.reads.listMovements(
        { ...query, order: 'asc', before, limit },
        null,
        sight,
      );
      period = page.period;
      return page;
    });
    recordContext({
      list: 'movements',
      filters: exportFilters(query),
      rows: rows.length,
    });
    const timeZone = requestTimeZone();
    const locale = localeOf(acceptLanguage);
    return csvFile(
      res,
      'movements',
      movementColumns({
        card: cardOf(query),
        places: sight.places,
        timeZone,
        locale,
      }),
      movementLines(rows, period, query, timeZone),
      locale,
    );
  }

  /**
   * One code by its id (ADR-093, 133b), for Movements to name a code it
   * filters by when no row and no picker's option does, a discontinued one
   * with nothing in the days chosen: under stock.view, as Movements is,
   * since the pickers' list asks products.view.
   */
  @Get('variants/:id')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  variant(
    @Param('id', ParseUUIDPipe) id: string,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<StockVariant> {
    return this.reads.variant(id, localeOf(acceptLanguage));
  }

  @Get('lots')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  listLots(@Query() query: ListLotsDto): Promise<Lot[]> {
    return this.lots.listLots(query);
  }

  @Patch('lots/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.STOCK_MOVE)
  @Audited({
    action: AUDIT_ACTIONS.STOCK_LOT_UPDATED,
    resourceType: 'lot',
    resourceId: (_response, request) => request.params.id,
  })
  async updateLot(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLotDto,
  ): Promise<void> {
    // Marking a code as made here lets it be renamed, so a recall may no
    // longer match the boxes: a permission of its own, beside stock.move,
    // asked before anything is read (ADR-094, R7).
    if (dto.madeHere) {
      await this.permissions.demand(user, [PERMISSIONS.STOCK_LOT_MADE_HERE]);
    }

    const { marked } = await this.lots.updateLot(id, dto);

    /**
     * The mark is its own entry in the Activity log, beside Lot updated
     * where the same save changed more (R7). Written here, as the
     * interceptor writes one: the mark has happened, so a failed entry is
     * logged rather than reported as a failed save.
     */
    if (!marked) return;
    try {
      await this.audit.record({
        actorId: user.userId,
        action: AUDIT_ACTIONS.STOCK_LOT_MARKED_MADE_HERE,
        resourceType: 'lot',
        resourceId: id,
        ip: user.ip,
        userAgent: user.userAgent,
      });
    } catch (error) {
      this.logger.error(`Audit write failed: ${String(error)}`);
      reportFault(error, { failed: 'an audit write' });
    }
  }

  /**
   * What the reader may see of each movement, by their permissions, read
   * once a request (ADR-080; 55a; ADR-093, 96a). An order's movements are
   * refused, 403, before any read, to a reader without orders.view, in
   * their words and naming whom to ask (#148): the answer alone would tell
   * which movements belong to an order they may not see (ADR-093).
   */
  private async sightOf(
    user: RequestContext,
    query: ListMovementsDto,
  ): Promise<MovementSight> {
    const held = await this.permissions.heldBy(user.membershipId);
    if (query.orderId && !held.has(PERMISSIONS.ORDERS_VIEW)) {
      throw await this.permissions.refusal(user, held, [
        PERMISSIONS.ORDERS_VIEW,
      ]);
    }
    return {
      places: held.has(PERMISSIONS.LOCATIONS_VIEW),
      orders: held.has(PERMISSIONS.ORDERS_VIEW),
      runs: held.has(PERMISSIONS.PRODUCTION_VIEW),
      partners: held.has(PERMISSIONS.PARTNERS_VIEW),
    };
  }
}
