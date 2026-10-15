import { Injectable } from '@nestjs/common';

import { HourlyTimer } from '../../common/hourly-timer';
import { OrganizationDeletionService } from './organization-deletion.service';

/**
 * Reminds the members of the deletions 7 days away, then completes those
 * whose day has ended everywhere (ADR-070), and the accounts that went
 * with them. Two instances running at once find nothing left to do the
 * second time.
 */
@Injectable()
export class OrganizationDeletionTimer extends HourlyTimer {
  constructor(private readonly deletion: OrganizationDeletionService) {
    super();
  }

  protected async run(): Promise<void> {
    const reminded = await this.deletion.remindDue();
    const { completed, failed } = await this.deletion.completeDue();
    if (reminded || completed || failed) {
      this.logger.log(
        `Organization deletions: ${reminded} reminded, ${completed} completed, ${failed} failed`,
      );
    }
  }
}
