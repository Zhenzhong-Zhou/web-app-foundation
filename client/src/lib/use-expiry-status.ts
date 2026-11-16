import { useIntl } from 'react-intl';

import type { ToneName } from '../theme/tokens';
import type { CalendarDay } from './api-names';
import { daysUntil, expiryTone } from './expiry';
import { useExpiryDays } from './use-expiry-days';

/**
 * How near a lot's expiry is, in words and a tone, as ExpiryChip shows it
 * and a lot's own page carries it beside its title (#479): "Expired 4
 * days ago", "Expires in 3 days". Null with no expiry, or one further
 * off than the organization's days.
 *
 * `today` is for tests; a page passes nothing and gets the
 * organization's (ADR-072).
 */
export function useExpiryStatus(
  expiresAt: CalendarDay | null,
  today?: CalendarDay,
): { label: string; tone: ToneName } | null {
  const intl = useIntl();
  const thresholds = useExpiryDays();

  if (!expiresAt) return null;

  const days = daysUntil(expiresAt, today);
  const tone = expiryTone(days, thresholds);
  if (!tone) return null;

  const label =
    days < 0
      ? intl.formatMessage(
          {
            id: 'components.expiry.expired',
            defaultMessage:
              '{days, plural, one {Expired # day ago} other {Expired # days ago}}',
          },
          { days: -days },
        )
      : intl.formatMessage(
          {
            id: 'components.expiry.inDays',
            defaultMessage:
              '{days, plural, =0 {Expires today} one {Expires in # day} other {Expires in # days}}',
          },
          { days },
        );

  return { label, tone };
}
