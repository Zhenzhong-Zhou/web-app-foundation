import { Injectable } from '@nestjs/common';

import { HourlyTimer } from '../../common/hourly-timer';
import { AccountDeletionService } from './account-deletion.service';

/**
 * Completes the deletions that have come due (ADR-069). Two instances
 * running at once find nothing left to do the second time.
 */
@Injectable()
export class AccountDeletionTimer extends HourlyTimer {
  constructor(private readonly deletion: AccountDeletionService) {
    super();
  }

  protected async run(): Promise<void> {
    const { completed, blocked, failed } = await this.deletion.completeDue();
    if (completed || blocked || failed) {
      this.logger.log(
        `Account deletions: ${completed} completed, ${blocked} blocked, ${failed} failed`,
      );
    }
  }
}
