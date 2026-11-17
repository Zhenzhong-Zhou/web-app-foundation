import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';

import { PERMISSIONS } from '../../core/authorization/permissions';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import { AvailabilityService } from './availability.service';
import type { LineHold } from './dto/availability-response.dto';

/**
 * What each order holds (ADR-045). Reads only; holds are computed from
 * open sale lines and stock, never stored. A code's Free, Held and Short
 * are Inventory's and Where it stands' (ADR-093), from code-figures.ts.
 */
@Controller({ version: '1' })
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('orders/:id/holds')
  @RequirePermissions(PERMISSIONS.ORDERS_VIEW)
  forOrder(@Param('id', ParseUUIDPipe) id: string): Promise<LineHold[]> {
    return this.availability.forOrder(id);
  }
}
