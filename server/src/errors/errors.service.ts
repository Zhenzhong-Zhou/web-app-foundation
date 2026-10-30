import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  createEnvelope,
  type DsnComponents,
  dsnToString,
  type EventEnvelope,
  getEnvelopeEndpointWithUrlEncodedAuth,
  makeDsn,
  serializeEnvelope,
  uuid4,
} from '@sentry/core';
import type { Event } from '@sentry/node';

/**
 * Where the browser's reports go, the project ERROR_TRACKER_DSN names or
 * none, and the deployment they are filed under; the e2e suite sets its
 * own (ADR-084).
 */
export const TRACKER_PROJECT = Symbol('TRACKER_PROJECT');

export interface TrackerProject {
  dsn: string | undefined;
  environment: string;
}

/** How long a relay may hold the browser's request, which waits for it. */
const RELAY_MS = 5000;

/**
 * Relays the browser's reports to the tracker (ADR-084), only ever to the
 * project the setting names: the browser's own envelope names a stand-in.
 */
@Injectable()
export class ErrorsService {
  private readonly logger = new Logger(ErrorsService.name);
  private readonly project: DsnComponents | undefined;

  constructor(
    @Inject(TRACKER_PROJECT) private readonly tracker: TrackerProject,
  ) {
    this.project = tracker.dsn ? makeDsn(tracker.dsn) : undefined;
  }

  /**
   * Sends one scrubbed event on, filed under this deployment, which only
   * the server knows; nothing while the setting is unset. A failure is a
   * warning, never a report, which would loop.
   */
  async relay(event: Event | undefined): Promise<void> {
    if (!event || !this.project) return;

    const envelope = createEnvelope<EventEnvelope>(
      {
        event_id: event.event_id ?? uuid4(),
        sent_at: new Date().toISOString(),
        dsn: dsnToString(this.project),
      },
      [
        [
          { type: 'event' },
          { ...event, environment: this.tracker.environment },
        ],
      ],
    );
    try {
      const response = await fetch(
        getEnvelopeEndpointWithUrlEncodedAuth(this.project),
        {
          method: 'POST',
          // JSON alone, which the SDK serializes as text.
          body: serializeEnvelope(envelope) as string,
          signal: AbortSignal.timeout(RELAY_MS),
        },
      );
      await response.body?.cancel();
      if (!response.ok) this.notRelayed({ status: response.status });
    } catch (error) {
      // Its name and code alone: a message can quote the project's address.
      this.notRelayed({
        error: (error as Error).name,
        code: ((error as Error).cause as { code?: string } | undefined)?.code,
      });
    }
  }

  private notRelayed(why: Record<string, unknown>): void {
    this.logger.warn(why, 'A browser’s error report was not relayed');
  }
}
