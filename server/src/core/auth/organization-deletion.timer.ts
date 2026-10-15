import { Injectable } from '@nestjs/common';

import { HourlyTimer } from '../../common/hourly-timer';
import { OrganizationDeletionService } from './organization-deletion.service';

/**
 * Completes the organization deletions whose day has ended everywhere
 * (ADR-070), then the accounts that went with them. Two instances running
 * at once find nothing left to do the second time.
 */
@Injectable()
export class OrganizationDeletionTimer extends HourlyTimer {
  constructor(private readonly deletion: OrganizationDeletionService) {
    super();
  }

  protected async run(): Promise<void> {
    const { completed, failed } = await this.deletion.completeDue();
    if (completed || failed) {
      this.logger.log(
        `Organization deletions: ${completed} completed, ${failed} failed`,
      );
    }
  }
}
