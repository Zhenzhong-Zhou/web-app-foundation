import type { IntlShape } from 'react-intl';

/**
 * Home's greeting by the hour: one place, for a member's Home and for an
 * account with no organization (ADR-058, ADR-078). A member's by the
 * organization's clock, which Home's date and time show beside it, so
 * "Good evening" never sits over "4:20 a.m." (ADR-091's review); with no
 * organization, the device's.
 */
export function greeting(
  intl: IntlShape,
  name: string,
  timeZone?: string,
): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone,
    }).format(new Date()),
  );
  if (hour < 12) {
    return intl.formatMessage(
      { id: 'home.greeting.morning', defaultMessage: 'Good morning, {name}' },
      { name },
    );
  }
  if (hour < 18) {
    return intl.formatMessage(
      {
        id: 'home.greeting.afternoon',
        defaultMessage: 'Good afternoon, {name}',
      },
      { name },
    );
  }
  return intl.formatMessage(
    { id: 'home.greeting.evening', defaultMessage: 'Good evening, {name}' },
    { name },
  );
}
