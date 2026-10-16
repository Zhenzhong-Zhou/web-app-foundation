import { ValidateBy } from 'class-validator';

import { defineMessage, rule } from '../../i18n/validation';
import { canonicalTimeZone } from '../today';

/**
 * An IANA time zone the server knows, such as `America/Vancouver`
 * (ADR-072); never an offset, which is wrong half the year wherever clocks
 * change. The service stores it under its canonical name
 * (`canonicalTimeZone`), so one zone is never stored two ways.
 *
 * `$property` names the field, as IsCurrencyCode() does.
 */
export const IsTimeZone = () =>
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
