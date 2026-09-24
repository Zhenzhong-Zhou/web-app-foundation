import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { AvailabilityService } from './availability.service';

/**
 * What can be promised, and what each order holds (ADR-045). Reads only;
 * holds are computed from open sale lines and stock, never stored.
 */
@Controller({ version: '1' })
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('stock/availability')
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  list() {
    return this.availability.list();
  }

  @Get('orders/:id/holds')
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  forOrder(@Param('id', ParseUUIDPipe) id: string) {
    return this.availability.forOrder(id);
  }
}
