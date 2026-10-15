import { Injectable } from '@nestjs/common';

import { HourlyTimer } from '../../common/hourly-timer';
import { FilesPurgeService } from './files-purge.service';

/**
 * Runs the purge (ADR-059). Two instances purging at once only delete the
 * same things twice.
 */
@Injectable()
export class FilesPurgeTimer extends HourlyTimer {
  constructor(private readonly purge: FilesPurgeService) {
    super();
  }

  protected async run(): Promise<void> {
    const { released, deleted } = await this.purge.purge();
    if (released || deleted) {
      this.logger.log(`Files: ${released} released, ${deleted} purged`);
    }
  }
}
