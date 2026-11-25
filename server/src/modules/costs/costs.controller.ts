import {
  Body,
  Controller,
  Get,
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
import { AcceptLanguage } from '../../i18n/accept-language.decorator';
import { localeOf } from '../../i18n/translate';
import { poolsOf, VALUATION_COLUMNS } from './cost-exports';
import { CostsService } from './costs.service';
import type {
  CorrectedCostEnvelope,
  ExchangeRateEnvelope,
  ExchangeRateList,
  LotCostEnvelope,
  NeedsCostPage,
  RunCostEnvelope,
  StockValuationPage,
  StockValuationTotals,
} from './dto/cost-response.dto';
import { ListExchangeRatesDto } from './dto/list-exchange-rates.dto';
import { ListNeedsCostDto } from './dto/list-needs-cost.dto';
import { ListValuationDto, ValuationTotalsDto } from './dto/list-valuation.dto';
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

  /**
   * Stock value: a page of its pools, found and sorted as asked (ADR-094's
   * amendment, R6). What they are worth together is the totals' read.
   */
  @Get('valuation')
  @RequirePermissions(PERMISSIONS.COSTS_VIEW)
  stockValuation(
    @Query() query: ListValuationDto,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<StockValuationPage> {
    return this.costs.valuation(query, localeOf(acceptLanguage));
  }

  /**
   * What every pool is worth together, and how many the find matches,
   * beside the list as Stock's counts are (R6): read once for a find,
   * never for a next page or a sort.
   */
  @Get('valuation/totals')
  @RequirePermissions(PERMISSIONS.COSTS_VIEW)
  valuationTotals(
    @Query() query: ValuationTotalsDto,
  ): Promise<StockValuationTotals> {
    return this.costs.valuationTotals(query);
  }

  /**
   * Stock value as CSV (ADR-057), as at the moment of export: every pool,
   * whatever the page shows.
   */
  @Get('valuation/export')
  @RequirePermissions(PERMISSIONS.COSTS_VIEW)
  @Audited({ action: AUDIT_ACTIONS.LIST_EXPORTED, resourceType: 'stock_value' })
  async exportValuation(
    @Res({ passthrough: true }) res: Response,
    @AcceptLanguage() acceptLanguage?: string,
  ) {
    const rows = withinLimit(poolsOf(await this.costs.everyPool()));
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
  async lotCost(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LotCostEnvelope> {
    return { lotCost: await this.costs.lotCost(id) };
  }

  @Get('runs/:id')
  @RequirePermissions(PERMISSIONS.COSTS_VIEW)
  async runCost(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RunCostEnvelope> {
    return { runCost: await this.costs.runCost(id) };
  }

  @Get('needs-cost')
  @RequirePermissions(PERMISSIONS.COSTS_VIEW)
  needsCost(
    @Query() query: ListNeedsCostDto,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<NeedsCostPage> {
    return this.costs.needsCost(query, localeOf(acceptLanguage));
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
  ): Promise<CorrectedCostEnvelope> {
    return { cost: await this.costs.setCost(id, dto, user.userId) };
  }

  @Get('exchange-rates')
  @RequirePermissions(PERMISSIONS.COSTS_VIEW)
  async listRates(
    @Query() query: ListExchangeRatesDto,
  ): Promise<ExchangeRateList> {
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
  async setRate(
    @Body() dto: SetExchangeRateDto,
  ): Promise<ExchangeRateEnvelope> {
    return { rate: await this.rates.set(dto) };
  }
}
