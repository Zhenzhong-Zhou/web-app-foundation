import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { csvFile, withinLimit } from '../../common/export';
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
import type { LotTrace } from './dto/lot-trace-response.dto';
import { SearchLotsDto } from './dto/search-lots.dto';
import type { LotMatch } from './dto/stock-response.dto';
import { LotTraceService } from './lot-trace.service';
import { RECALL_COLUMNS } from './stock-exports';

/**
 * One lot's whole story (ADR-044). A read over what the ledger already holds,
 * under stock.view: whoever can see a lot's balance can ask where it went.
 * Where it is now names its places only to a reader with `locations.view`
 * (ADR-080; ADR-093, 96a), as Stock does.
 */
@Controller({ path: 'stock/lots', version: '1' })
export class LotTraceController {
  constructor(
    private readonly traces: LotTraceService,
    private readonly permissions: PermissionsService,
  ) {}

  /** Find a lot by the start of its code: how a recall usually begins. */
  @Get('search')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  search(@Query() query: SearchLotsDto): Promise<LotMatch[]> {
    return this.traces.search(query.code);
  }

  @Get(':id/trace')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  async trace(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestContext,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<LotTrace> {
    const held = await this.permissions.heldBy(user.membershipId);
    return this.traces.trace(
      id,
      localeOf(acceptLanguage),
      held.has(PERMISSIONS.LOCATIONS_VIEW),
    );
  }

  /**
   * The recall list as CSV (ADR-044, amended; #473's 17): Who received
   * it, as the trace lists them, for a recall letter.
   */
  @Get(':id/recipients/export')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Audited({
    action: AUDIT_ACTIONS.LIST_EXPORTED,
    resourceType: 'lot',
    resourceId: (_response, request) => request.params.id,
  })
  async exportRecipients(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
    @AcceptLanguage() acceptLanguage?: string,
  ) {
    const locale = localeOf(acceptLanguage);
    // Who received it alone: no place's name is read for the recall list.
    const rows = withinLimit(
      (await this.traces.trace(id, locale, false)).recipients,
    );
    recordContext({ list: 'recall', filters: { id }, rows: rows.length });
    return csvFile(res, 'recall-list', RECALL_COLUMNS, rows, locale);
  }
}
