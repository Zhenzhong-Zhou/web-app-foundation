import { Box } from '@mui/material';
import { useIntl } from 'react-intl';

import { daysUntil, expiryTone } from '../lib/expiry';
import { formatDay, NO_VALUE } from '../lib/format';
import type { CalendarDay } from '../lib/types';
import { useExpiryDays } from '../lib/use-expiry-days';
import { StatusChip } from './status-chip';

/**
 * A lot's expiry (ADR-055). Close to it, the days left in a chip, amber
 * within 90 and red within 30 or past, with the date beside it in grey:
 * "how long" is what someone acts on, and the date is what they check it
 * against. Further off, the date alone. No expiry, a dash.
 *
 * `today` is for tests; the page passes nothing and gets the reader's own.
 */
export function ExpiryChip({
  expiresAt,
  today,
}: {
  expiresAt: CalendarDay | null;
  today?: CalendarDay;
}) {
  const intl = useIntl();
  const thresholds = useExpiryDays();

  if (!expiresAt) return NO_VALUE;

  const date = formatDay(expiresAt);
  const days = daysUntil(expiresAt, today);
  const tone = expiryTone(days, thresholds);

  if (!tone) return date;

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

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <StatusChip tone={tone} label={label} />
      <Box
        component="span"
        sx={{ color: 'text.secondary', typography: 'body2' }}
      >
        {date}
      </Box>
    </Box>
  );
}
