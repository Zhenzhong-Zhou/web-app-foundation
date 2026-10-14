import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env';
import { AccountDeletionService } from './account-deletion.service';

const HOUR = 60 * 60 * 1000;

/**
 * Completes the deletions that have come due, hourly while the server is
 * up (ADR-069), as the file purge runs (ADR-059): a server that sleeps
 * when idle still completes them whenever it wakes, and two instances
 * running at once find nothing left to do the second time. Not in tests,
 * which call completeDue() themselves.
 */
@Injectable()
export class AccountDeletionTimer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AccountDeletionTimer.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly deletion: AccountDeletionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.timer = setInterval(() => void this.run(), HOUR);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      const { completed, blocked } = await this.deletion.completeDue();
      if (completed || blocked) {
        this.logger.log(
          `Account deletions: ${completed} completed, ${blocked} blocked`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Account deletions failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
