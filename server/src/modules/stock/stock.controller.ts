import {
  Body,
  Controller,
  Get,
  Headers,
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
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { localeOf } from '../../i18n/translate';
import { AdjustmentGuard } from './adjustment.guard';
import { ListLotsDto } from './dto/list-lots.dto';
import { ListMovementsDto } from './dto/list-movements.dto';
import { ListStockDto } from './dto/list-stock.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { LotsService } from './lots.service';
import { StockService } from './stock.service';
import { MOVEMENT_COLUMNS, STOCK_COLUMNS } from './stock-exports';
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
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  list(@Query() query: ListStockDto) {
    return this.reads.list(query);
  }

  /** What is on hand, as the filters narrow it, as CSV (ADR-057): the list's own query, every page. */
  @Get('export')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Audited({ action: AUDIT_ACTIONS.LIST_EXPORTED, resourceType: 'inventory' })
  async exportInventory(
    @Query() query: ListStockDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const rows = await everyRow((before, limit) =>
      this.reads.list({ ...query, before, limit }),
    );
    recordContext({
      list: 'inventory',
      filters: exportFilters(query),
      rows: rows.length,
    });
    return csvFile(
      res,
      'inventory',
      STOCK_COLUMNS,
      rows,
      localeOf(acceptLanguage),
    );
  }

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
  ) {
    /**
     * @Audited sits above this and does not replace it. The movement carries
     * actor_id itself and not-null (ADR-023): a manual adjustment with no name
     * attached is precisely the row someone will ask about, and the audit log
     * answers a different question with a different retention.
     */
    return { movement: await this.stock.record(dto, user.userId) };
  }

  /** Counts beside the inventory's quick filters (ADR-055). */
  @Get('counts')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  counts(@Query() query: ListStockDto) {
    return this.reads.counts(query);
  }

  @Get('movements')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  listMovements(@Query() query: ListMovementsDto) {
    return this.reads.listMovements(query);
  }

  /** Every movement the filters match, as CSV (ADR-057): the list's own query, every page. */
  @Get('movements/export')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Audited({ action: AUDIT_ACTIONS.LIST_EXPORTED, resourceType: 'movements' })
  async exportMovements(
    @Query() query: ListMovementsDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const rows = await everyRow((before, limit) =>
      this.reads.listMovements({ ...query, before, limit }),
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
  listLots(@Query() query: ListLotsDto) {
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
}
