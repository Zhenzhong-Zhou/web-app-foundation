import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';

import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import type { LotTrace } from './dto/lot-trace-response.dto';
import { SearchLotsDto } from './dto/search-lots.dto';
import type { LotMatch } from './dto/stock-response.dto';
import { LotTraceService } from './lot-trace.service';

/**
 * One lot's whole story (ADR-044). A read over what the ledger already holds,
 * under stock.view: whoever can see a lot's balance can ask where it went.
 */
@Controller({ path: 'stock/lots', version: '1' })
export class LotTraceController {
  constructor(private readonly traces: LotTraceService) {}

  /** Find a lot by the start of its code: how a recall usually begins. */
  @Get('search')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  search(@Query() query: SearchLotsDto): Promise<LotMatch[]> {
    return this.traces.search(query.code);
  }

  @Get(':id/trace')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  trace(@Param('id', ParseUUIDPipe) id: string): Promise<LotTrace> {
    return this.traces.trace(id);
  }
}
