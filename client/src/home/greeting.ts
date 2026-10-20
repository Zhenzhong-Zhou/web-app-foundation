import type { IntlShape } from 'react-intl';

/**
 * Home's greeting by the reader's hour: one place, for a member's Home and
 * for an account with no organization (ADR-058, ADR-078).
 */
export function greeting(intl: IntlShape, name: string): string {
  const hour = new Date().getHours();
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
