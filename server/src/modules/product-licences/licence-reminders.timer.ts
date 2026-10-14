import { Injectable } from '@nestjs/common';

import { HourlyTimer } from '../../common/hourly-timer';
import { LicenceRemindersService } from './licence-reminders.service';

/**
 * Sends the licence reminders that are due (ADR-064). The claim on each
 * licence keeps two instances from sending one notice twice.
 */
@Injectable()
export class LicenceRemindersTimer extends HourlyTimer {
  constructor(private readonly reminders: LicenceRemindersService) {
    super();
  }

  protected async run(): Promise<void> {
    await this.reminders.remind();
  }
}
