import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { PermissionsService } from '../../core/authorization/permissions.service';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { AcceptLanguage } from '../../i18n/accept-language.decorator';
import { localeOf } from '../../i18n/translate';
import type { ProductStock } from './dto/where-it-stands-response.dto';
import { WhereItStandsService } from './where-it-stands.service';

/**
 * Where it stands, on the item's page (ADR-093, R8), beside the item's
 * own routes. The section needs `stock.view`, as Stock's reads do; places,
 * sales, purchases and runs are each read only with their own view
 * permission, left out of the answer for a reader without it (ADR-080),
 * so the server never sends what a reader may not see.
 */
@Controller({ path: 'products', version: '1' })
export class WhereItStandsController {
  constructor(
    private readonly standing: WhereItStandsService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get(':id/stock')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  async read(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestContext,
    @AcceptLanguage() acceptLanguage?: string,
  ): Promise<ProductStock> {
    const held = await this.permissions.heldBy(user.membershipId);
    return this.standing.read(id, localeOf(acceptLanguage), {
      places: held.has(PERMISSIONS.LOCATIONS_VIEW),
      orders: held.has(PERMISSIONS.ORDERS_VIEW),
      runs: held.has(PERMISSIONS.PRODUCTION_VIEW),
    });
  }
}
