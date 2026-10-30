import { parseArgs } from 'node:util';

import {
  createEnvelope,
  type EventEnvelope,
  serializeEnvelope,
  uuid4,
} from '@sentry/core';

/**
 * What `npm run error-tracker:test` sends, and where (ADR-084), kept apart
 * from the request so each is a unit test. Everything here speaks English:
 * only the operator reads it.
 */

/**
 * The project the report's envelope names, as the browser's does: a
 * stand-in, which the server replaces with its own setting's project.
 */
export const STAND_IN = 'https://public@errors.invalid/1';

export const HELP = `Send one test report to the error tracker through a site, as the browser does (ADR-084).

  npm run error-tracker:test -- <site>

  <site>  the site's address, such as http://localhost:5173 or
          https://web-app-foundation-client.onrender.com

It posts to <site>/api/errors and prints the answer and the report's id,
to find in the tracker. The project is the API's ERROR_TRACKER_DSN, so
nothing secret is needed here.
`;

/** A command line or a site the command cannot use, said as it is. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** The command line, after `--`: the site's /api/errors. */
export function reportAddress(argv: string[]): URL {
  let positionals: string[];
  try {
    ({ positionals } = parseArgs({ args: argv, allowPositionals: true }));
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  if (positionals.length !== 1) {
    throw new UsageError('Give the site’s address, and only that.');
  }

  let site: URL;
  try {
    site = new URL(positionals[0]);
  } catch {
    throw new UsageError(`Not an address: ${positionals[0]}`);
  }
  if (site.protocol !== 'http:' && site.protocol !== 'https:') {
    throw new UsageError(
      `Not a site’s address: ${positionals[0]}. It starts with http:// or https://.`,
    );
  }
  return new URL('/api/errors', site);
}

/** One test report, its id, and the envelope that carries it. */
export function testReport(now = new Date()): { id: string; body: string } {
  const id = uuid4();
  const envelope = createEnvelope<EventEnvelope>(
    { event_id: id, sent_at: now.toISOString(), dsn: STAND_IN },
    [
      [
        { type: 'event' },
        {
          event_id: id,
          timestamp: now.getTime() / 1000,
          platform: 'node',
          level: 'error',
          exception: {
            values: [
              {
                type: 'Error',
                value: 'A test report, sent by npm run error-tracker:test',
              },
            ],
          },
        },
      ],
    ],
  );
  // JSON alone, which the SDK serializes as text.
  return { id, body: serializeEnvelope(envelope) as string };
}
