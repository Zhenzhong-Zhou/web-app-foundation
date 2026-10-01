import { applyDecorators } from '@nestjs/common';
import { IsISO8601, IsString, Matches } from 'class-validator';

/**
 * A calendar day, YYYY-MM-DD, sent by the client: invoice, due, credit and
 * rate dates. The organization has no timezone, so the server cannot know
 * the person's day; the client sends it, and a `date` column stores it as it
 * arrives, never through a JS Date (ADR-046).
 *
 * The pattern keeps the shape; strict ISO 8601 refuses a day that does not
 * exist, so 2026-02-30 is a 400 here rather than a 500 from Postgres.
 * `$property` names the field, as IsCurrencyCode() does.
 */
export const IsCalendarDay = () =>
  applyDecorators(
    IsString(),
    Matches(/^\d{4}-\d{2}-\d{2}$/, {
      message: '$property must be a calendar day, YYYY-MM-DD',
    }),
    IsISO8601({ strict: true }, { message: '$property must be a real date' }),
  );
