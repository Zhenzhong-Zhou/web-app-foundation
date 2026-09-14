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
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { Audited } from '../../core/audit/audited.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { ListLotsDto } from './dto/list-lots.dto';
import { ListMovementsDto } from './dto/list-movements.dto';
import { ListStockDto } from './dto/list-stock.dto';
import { RecordMovementDto } from './dto/record-movement.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { StockService } from './stock.service';

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
  constructor(private readonly stock: StockService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  list(@Query() query: ListStockDto) {
    return this.stock.list(query);
  }

  @Post('movements')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.STOCK_MOVE)
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

  @Get('movements')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  listMovements(@Query() query: ListMovementsDto) {
    return this.stock.listMovements(query);
  }

  @Get('lots')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  listLots(@Query() query: ListLotsDto) {
    return this.stock.listLots(query);
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
    await this.stock.updateLot(id, dto);
  }
}
