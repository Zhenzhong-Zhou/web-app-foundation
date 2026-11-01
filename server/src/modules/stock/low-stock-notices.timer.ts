import { Injectable } from '@nestjs/common';

import { HourlyTimer } from '../../common/hourly-timer';
import { LowStockNoticesService } from './low-stock-notices.service';

/**
 * Tells who can act on it when an item falls below its reorder point
 * (ADR-085). The claim on each point keeps two instances from telling one
 * fall twice.
 */
@Injectable()
export class LowStockNoticesTimer extends HourlyTimer {
  constructor(private readonly notices: LowStockNoticesService) {
    super();
  }

  protected async run(): Promise<void> {
    await this.notices.check();
  }
}
