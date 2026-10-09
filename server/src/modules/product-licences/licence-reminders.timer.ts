import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env';
import { LicenceRemindersService } from './licence-reminders.service';

const HOUR = 60 * 60 * 1000;

/**
 * Checks hourly while the server is up (ADR-064), as the file purge does:
 * a server that sleeps when idle still reminds whenever it wakes, and the
 * claim on each licence keeps two instances from sending one notice
 * twice. Once at start too, so a fresh deploy does not wait an hour. Not
 * in tests, which call remind themselves.
 */
@Injectable()
export class LicenceRemindersTimer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(LicenceRemindersTimer.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly reminders: LicenceRemindersService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    void this.run();
    this.timer = setInterval(() => void this.run(), HOUR);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  private async run(): Promise<void> {
    try {
      await this.reminders.remind();
    } catch (error) {
      this.logger.error(
        'Licence reminders failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
