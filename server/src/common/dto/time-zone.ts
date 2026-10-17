import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsOptional, ValidateBy } from 'class-validator';

import { defineMessage, rule } from '../../i18n/validation';
import { canonicalTimeZone } from '../today';

const isTimeZone = () =>
  ValidateBy({
    name: 'isTimeZone',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && canonicalTimeZone(value) !== null,
      defaultMessage: rule(
        defineMessage({
          id: 'validation.timeZone',
          defaultMessage:
            '{property} must be a time zone name, such as America/Vancouver',
        }),
      ),
    },
  });

/**
 * An IANA time zone the server knows, such as `America/Vancouver`
 * (ADR-072): UTC, or a place; never an offset, which is wrong half the year
 * wherever clocks change. It arrives under its canonical name
 * (`canonicalTimeZone`), so one zone is never stored two ways, whichever
 * way in it came.
 *
 * `$property` names the field, as IsCurrencyCode() does.
 */
export const IsTimeZone = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? (canonicalTimeZone(value) ?? value) : value,
    ),
    isTimeZone(),
  );

/**
 * The zone a browser reported, which nobody typed: under its canonical
 * name when the server takes it, and dropped when not, so the organization
 * starts on UTC rather than registration failing over a field the person
 * never saw (ADR-072). A browser that cannot tell its own zone reports
 * `Etc/Unknown`. Anything but a string is still refused.
 */
export const IsBrowserTimeZone = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string'
        ? (canonicalTimeZone(value) ?? undefined)
        : value,
    ),
    IsOptional(),
    isTimeZone(),
  );
