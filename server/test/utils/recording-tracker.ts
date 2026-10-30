import * as Sentry from '@sentry/node';

import { flushFaults, startTracker } from '../../src/common/faults/tracker';

/**
 * The error tracker as main.ts starts it, with a transport that records each
 * event instead of sending it: nothing in a test reaches a real tracker
 * (ADR-084). The tracker is the process's own, so a test starts it and its
 * suite's afterEach stops it.
 */
export class RecordingTracker {
  private readonly events: Sentry.Event[] = [];

  start(): void {
    startTracker(
      {
        ERROR_TRACKER_DSN: 'https://publickey@o1.ingest.example.invalid/42',
        NODE_ENV: 'test',
      },
      (options) =>
        Sentry.createTransport(options, (request) => {
          const lines = String(request.body).split('\n');
          for (let i = 1; i < lines.length; i += 2) {
            const item = JSON.parse(lines[i]) as { type: string };
            if (item.type === 'event') {
              this.events.push(JSON.parse(lines[i + 1]) as Sentry.Event);
            }
          }
          return Promise.resolve({ statusCode: 200 });
        }),
    );
  }

  /** What the tracker has been sent, once the reports pending have gone. */
  async sent(): Promise<Sentry.Event[]> {
    await flushFaults();
    return this.events;
  }

  async stop(): Promise<void> {
    await Sentry.close();
    Sentry.getCurrentScope().setClient(undefined);
    this.events.length = 0;
  }
}
