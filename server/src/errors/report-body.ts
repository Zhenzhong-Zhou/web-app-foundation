import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { parseEnvelope } from '@sentry/core';
import type { Event } from '@sentry/node';
import type { Request } from 'express';
import getRawBody from 'raw-body';

import { scrubEvent } from '../common/faults/scrub';
import { t } from '../i18n/translate';

/** A report's most (ADR-084). */
const MAX_BYTES = 200 * 1024;

/**
 * A report's body, read here for this route alone: the app's parsers take
 * JSON and forms, and the tracker's SDK sends text. Past 200 KB, 413 at
 * once, as declared or as it arrives, and the rest is read and thrown away.
 * A JSON or form body, which those parsers have read already, and one cut
 * short or not the length it declared, are no report.
 */
export async function readReport(request: Request): Promise<Buffer> {
  try {
    return await getRawBody(request, {
      length: request.headers['content-length'],
      limit: MAX_BYTES,
    });
  } catch (error) {
    request.resume();
    throw (error as { type?: string }).type === 'entity.too.large'
      ? tooLarge()
      : unreadable();
  }
}

/**
 * The report's event, scrubbed (ADR-084), or none: 400 for a body that is
 * not the SDK's envelope, or whose event cannot be read. The envelope's
 * other items, session counts, client reports and the rest, are dropped,
 * and so is any event after the first: the tracker takes one an envelope,
 * as the SDK sends it.
 */
export function eventOf(body: Uint8Array): Event | undefined {
  try {
    const [header, items] = parseEnvelope(body);
    if (
      !isObject(header) ||
      !items.every(([item]) => isObject(item) && typeof item.type === 'string')
    ) {
      throw unreadable();
    }

    const found = items.find(([item]) => item.type === 'event');
    if (!found) return undefined;
    const [, payload] = found;
    const event: unknown =
      payload instanceof Uint8Array
        ? JSON.parse(new TextDecoder().decode(payload))
        : payload;
    if (!isObject(event)) throw unreadable();
    // A field of the wrong type fails here, not as a 500 of the app's own.
    return scrubEvent(event);
  } catch {
    throw unreadable();
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unreadable(): BadRequestException {
  return new BadRequestException(
    t({
      id: 'errors.report.unreadable',
      defaultMessage:
        'That is not an error report the app can read. Send one as the app’s own pages do.',
    }),
  );
}

function tooLarge(): PayloadTooLargeException {
  return new PayloadTooLargeException(
    t({
      id: 'errors.report.tooLarge',
      defaultMessage:
        'An error report can be at most 200 KB. Send a shorter one.',
    }),
  );
}
