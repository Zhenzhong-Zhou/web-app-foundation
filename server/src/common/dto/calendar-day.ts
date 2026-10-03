import { applyDecorators, Logger } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsISO8601, IsString, Matches } from 'class-validator';

/** How strictly a calendar day is read from a request (ADR-052). */
export const CALENDAR_DAY_INPUTS = ['strict', 'lenient'] as const;

export type CalendarDayInput = (typeof CALENDAR_DAY_INPUTS)[number];

/**
 * CALENDAR_DAY_INPUT, read when a request is validated rather than when the
 * DTO class is defined, so a test can switch it without rebuilding the app.
 * Decorators run before Nest's injector exists, so ConfigService is not
 * available here; the env schema still validates the value at boot, which
 * is what catches a typo. Anything but `lenient` is strict, so a missing
 * variable keeps the strict default.
 */
export function calendarDayInput(): CalendarDayInput {
  return process.env.CALENDAR_DAY_INPUT === 'lenient' ? 'lenient' : 'strict';
}

/**
 * The one instant lenient mode accepts: exactly midnight UTC, with or without
 * milliseconds, which is what `utcMidnight` sent before ADR-052. Any other
 * instant would need a time zone to become a day, and choosing one is the
 * guess ADR-052 removes.
 */
const UTC_MIDNIGHT = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0{1,3})?Z$/;

const logger = new Logger('CalendarDay');

/**
 * Under lenient, an instant at UTC midnight becomes its day before
 * validation runs, and says so in the log. The warning is how whoever runs
 * the deployment knows when nothing sends the old shape any more and strict
 * can be switched on. Logged inside the request, so its line carries the
 * route the request was for.
 */
function acceptUtcMidnight({
  value,
  key,
}: {
  value: unknown;
  key: string;
}): unknown {
  if (typeof value !== 'string' || calendarDayInput() !== 'lenient') {
    return value;
  }

  const match = UTC_MIDNIGHT.exec(value);
  if (!match) return value;

  logger.warn(
    `${key} arrived as ${value} and was read as ${match[1]}. Send YYYY-MM-DD; CALENDAR_DAY_INPUT=lenient accepts the instant only for a transition (ADR-052).`,
  );

  return match[1];
}

/**
 * A calendar day, YYYY-MM-DD, sent by the client: an invoice, due, credit or
 * rate date, a lot's expiry, an order's expected date, a licence's dates.
 * The organization has no timezone, so the server cannot know the person's
 * day; the client sends it, and a `date` column stores it as it arrives,
 * never through a JS Date (ADR-046, ADR-052).
 *
 * The pattern keeps the shape; strict ISO 8601 refuses a day that does not
 * exist, so 2026-02-30 is a 400 here rather than a 500 from Postgres.
 * `$property` names the field, as IsCurrencyCode() does.
 *
 * Under CALENDAR_DAY_INPUT=lenient, an instant at exactly UTC midnight is
 * also accepted and read as its day; every other instant is refused in both
 * modes.
 */
export const IsCalendarDay = () =>
  applyDecorators(
    Transform(acceptUtcMidnight),
    IsString(),
    Matches(/^\d{4}-\d{2}-\d{2}$/, {
      message: '$property must be a calendar day, YYYY-MM-DD',
    }),
    IsISO8601({ strict: true }, { message: '$property must be a real date' }),
  );
