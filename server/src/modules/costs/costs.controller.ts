import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
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
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { localeOf } from '../../i18n/translate';
import { poolsOf, VALUATION_COLUMNS } from './cost-exports';
import { CostsService } from './costs.service';
import { ListExchangeRatesDto } from './dto/list-exchange-rates.dto';
import { ListNeedsCostDto } from './dto/list-needs-cost.dto';
import { SetCostDto } from './dto/set-cost.dto';
import { SetExchangeRateDto } from './dto/set-exchange-rate.dto';
import { ExchangeRatesService } from './exchange-rates.service';

/**
 * What stock, lots and batches cost, and the two things that correct it:
 * a cost set on an acquisition, and an exchange rate (ADR-048).
 *
 * Its own permissions, Owner-only by default. What a batch cost is a margin
 * once price lists exist, which is not the same thing as a purchase price
 * already visible on a purchase order.
 */
@Controller({ path: 'costs', version: '1' })
export class CostsController {
  constructor(
    private readonly costs: CostsService,
    private readonly rates: ExchangeRatesService,
  ) {}

  @Get('valuation')
  @RequirePermissions(PERMISSIONS.COSTS_VIEW)
  async stockValuation() {
    return { valuation: await this.costs.stockValuation() };
  }

  /** Stock value as CSV (ADR-057), as at the moment of export. */
  @Get('valuation/export')
  @RequirePermissions(PERMISSIONS.COSTS_VIEW)
  @Audited({ action: AUDIT_ACTIONS.LIST_EXPORTED, resourceType: 'stock_value' })
  async exportValuation(
    @Res({ passthrough: true }) res: Response,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const rows = withinLimit(poolsOf(await this.costs.stockValuation()));
    recordContext({ list: 'stock_value', filters: {}, rows: rows.length });
    return csvFile(
      res,
      'stock-value',
      VALUATION_COLUMNS,
      rows,
      localeOf(acceptLanguage),
    );
  }

  @Get('lots/:id')
  @RequirePermissions(PERMISSIONS.COSTS_VIEW)
  async lotCost(@Param('id', ParseUUIDPipe) id: string) {
    return { lotCost: await this.costs.lotCost(id) };
  }

  @Get('runs/:id')
  @RequirePermissions(PERMISSIONS.COSTS_VIEW)
  async runCost(@Param('id', ParseUUIDPipe) id: string) {
    return { runCost: await this.costs.runCost(id) };
  }

  @Get('needs-cost')
  @RequirePermissions(PERMISSIONS.COSTS_VIEW)
  needsCost(@Query() query: ListNeedsCostDto) {
    return this.costs.needsCost(query);
  }

  /**
   * Sets or corrects what one acquisition cost. Keyed by the valuation row
   * rather than the movement, because an opening balance has no movement and
   * needs a cost too.
   */
  @Put('valuations/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.COSTS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.STOCK_VALUATION_COST_SET,
    resourceType: 'stock_valuation',
    resourceId: (_response, request) => request.params.id,
    fields: ['unitPrice', 'currency', 'exchangeRate'],
  })
  async setCost(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetCostDto,
    @CurrentUser() user: RequestContext,
  ) {
    return { cost: await this.costs.setCost(id, dto, user.userId) };
  }

  @Get('exchange-rates')
  @RequirePermissions(PERMISSIONS.COSTS_VIEW)
  async listRates(@Query() query: ListExchangeRatesDto) {
    return { rates: await this.rates.list(query) };
  }

  @Put('exchange-rates')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.COSTS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.EXCHANGE_RATE_SET,
    resourceType: 'exchange_rate',
    resourceId: (response: { rate: { id: string } }) => response.rate.id,
    fields: ['currency', 'rateDate', 'rate'],
  })
  async setRate(@Body() dto: SetExchangeRateDto) {
    return { rate: await this.rates.set(dto) };
  }
}
