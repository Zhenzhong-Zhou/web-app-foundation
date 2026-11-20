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
  Res,
  UseGuards,
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
import { AdjustmentGuard } from './adjustment.guard';
import { ListLotsDto } from './dto/list-lots.dto';
import { ListMovementsDto } from './dto/list-movements.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import type {
  Lot,
  MovementPage,
  RecordedMovementEnvelope,
} from './dto/stock-response.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { LotsService } from './lots.service';
import { movementOf, type MovementSight } from './movement-view';
import { StockService } from './stock.service';
import { MOVEMENT_COLUMNS } from './stock-exports';
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
  constructor(
    private readonly stock: StockService,
    private readonly reads: StockReadsService,
    private readonly lots: LotsService,
    private readonly permissions: PermissionsService,
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
    return { movement: movementOf(await this.stock.record(dto, user.userId)) };
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

  /** Every movement the filters match, as CSV (ADR-057): the list's own query, every page. */
  @Get('movements/export')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Audited({ action: AUDIT_ACTIONS.LIST_EXPORTED, resourceType: 'movements' })
  async exportMovements(
    @Query() query: ListMovementsDto,
    @CurrentUser() user: RequestContext,
    @Res({ passthrough: true }) res: Response,
    @AcceptLanguage() acceptLanguage?: string,
  ) {
    // An order's movements refused as the list refuses them. The file
    // names no document, and both places, as it always has.
    await this.sightOf(user, query);
    // The base names, as every CSV keeps them (ADR-056).
    const rows = await everyRow((before, limit) =>
      this.reads.listMovements({ ...query, before, limit }, null, {
        places: true,
        orders: false,
        runs: false,
      }),
    );
    recordContext({
      list: 'movements',
      filters: exportFilters(query),
      rows: rows.length,
    });
    return csvFile(
      res,
      'movements',
      MOVEMENT_COLUMNS,
      rows,
      localeOf(acceptLanguage),
    );
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLotDto,
  ): Promise<void> {
    await this.lots.updateLot(id, dto);
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
    };
  }
}
