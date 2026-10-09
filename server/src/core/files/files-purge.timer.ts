import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env';
import { FilesService } from './files.service';

const HOUR = 60 * 60 * 1000;

/**
 * Runs the purge hourly while the server is up (ADR-059). Hourly rather
 * than at a set time: a server that sleeps when idle still purges whenever
 * it wakes, and two instances purging at once only delete the same things
 * twice. Not in tests, which call purge themselves.
 */
@Injectable()
export class FilesPurgeTimer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(FilesPurgeTimer.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly files: FilesService,
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
      const { released, deleted } = await this.files.purge();
      if (released || deleted) {
        this.logger.log(`Files: ${released} released, ${deleted} purged`);
      }
    } catch (error) {
      this.logger.error(
        'File purge failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
