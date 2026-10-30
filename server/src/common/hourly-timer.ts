import { Logger, type OnApplicationShutdown } from '@nestjs/common';

import { reportFault } from './faults/tracker';

const HOUR = 60 * 60 * 1000;

/**
 * Work no request starts, run at startup and then hourly while the server
 * is up. Startup too, because the server sleeps after 15 minutes without a
 * request: woken for less than an hour at a time, an hourly timer alone
 * would never fire. Each job must be safe to run on two instances at once.
 * A run that fails is logged, and the next one tries again. It is reported
 * too (ADR-084), unless the run before it failed: a fault that lasts is one
 * report until a run succeeds, not one an hour against the tracker's
 * monthly allowance.
 *
 * Started by main.ts once the server listens, not when the application
 * boots: the tests and the seed scripts boot the same modules. The tests
 * call each job themselves, and a script closes the database under any
 * job still running. A new timer joins main.ts's list.
 */
export abstract class HourlyTimer implements OnApplicationShutdown {
  protected readonly logger = new Logger(this.constructor.name);
  private timer?: NodeJS.Timeout;
  /** Whether the last run failed, so a fault that lasts is reported once. */
  private failing = false;

  protected abstract run(): Promise<void>;

  start(): void {
    void this.runLogged();
    this.timer = setInterval(() => void this.runLogged(), HOUR);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  private async runLogged(): Promise<void> {
    try {
      await this.run();
      this.failing = false;
    } catch (error) {
      this.logger.error(
        'Run failed',
        error instanceof Error ? error.stack : String(error),
      );
      if (!this.failing) reportFault(error, { job: this.constructor.name });
      this.failing = true;
    }
  }
}
