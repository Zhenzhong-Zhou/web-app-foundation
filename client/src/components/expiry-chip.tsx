import { Box } from '@mui/material';
import { useIntl } from 'react-intl';

import type { Lot } from '../api/types.gen';
import type { CalendarDay } from '../lib/api-names';
import { formatDay, NO_VALUE } from '../lib/format';
import { useExpiryStatus } from '../lib/use-expiry-status';
import { StatusChip } from './status-chip';

/**
 * A lot's expiry (ADR-055). Close to it, the days left in a chip, amber
 * within 90 and red within 30 or past, with the date beside it in grey:
 * "how long" is what someone acts on, and the date is what they check it
 * against. Further off, the date alone. No expiry, a dash; one not
 * known yet, given its kind, "Expiry to add" in grey, the lot's mark
 * until its date is added (ADR-094, R9).
 *
 * `today` is for tests; the page passes nothing and gets the
 * organization's (ADR-072).
 */
export function ExpiryChip({
  expiresAt,
  expiry,
  today,
}: {
  expiresAt: CalendarDay | null;
  /** The lot's kind of expiry, where the read sends it (ADR-094, R8). */
  expiry?: Lot['expiry'] | null;
  today?: CalendarDay;
}) {
  const intl = useIntl();
  const status = useExpiryStatus(expiresAt, today);

  if (expiry === 'unknown') {
    return (
      <Box
        component="span"
        sx={{ color: 'text.secondary', typography: 'body2' }}
      >
        {intl.formatMessage({
          id: 'inventory.lot.expiryToAdd',
          defaultMessage: 'Expiry to add',
        })}
      </Box>
    );
  }
  if (!expiresAt) return NO_VALUE;

  const date = formatDay(expiresAt);
  if (!status) return date;

  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: 1,
        rowGap: 0.5,
        // The date goes under the chip where both do not fit, and the
        // chip's words wrap before they are cut (R14; WCAG 1.4.10).
        '& .MuiChip-root': { maxWidth: '100%', height: 'auto' },
        '& .MuiChip-label': { whiteSpace: 'normal' },
      }}
    >
      <StatusChip tone={status.tone} label={status.label} />
      <Box
        component="span"
        sx={{
          color: 'text.secondary',
          typography: 'body2',
          whiteSpace: 'nowrap',
        }}
      >
        {date}
      </Box>
    </Box>
  );
}
