import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { LotTraceService } from './lot-trace.service';

/**
 * One lot's whole story (ADR-044). A read over what the ledger already holds,
 * under stock.view: whoever can see a lot's balance can ask where it went.
 */
@Controller({ path: 'stock/lots', version: '1' })
export class LotTraceController {
  constructor(private readonly traces: LotTraceService) {}

  @Get(':id/trace')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  trace(@Param('id', ParseUUIDPipe) id: string) {
    return this.traces.trace(id);
  }
}
