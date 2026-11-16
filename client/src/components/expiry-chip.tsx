import { Box } from '@mui/material';

import type { CalendarDay } from '../lib/api-names';
import { formatDay, NO_VALUE } from '../lib/format';
import { useExpiryStatus } from '../lib/use-expiry-status';
import { StatusChip } from './status-chip';

/**
 * A lot's expiry (ADR-055). Close to it, the days left in a chip, amber
 * within 90 and red within 30 or past, with the date beside it in grey:
 * "how long" is what someone acts on, and the date is what they check it
 * against. Further off, the date alone. No expiry, a dash.
 *
 * `today` is for tests; the page passes nothing and gets the
 * organization's (ADR-072).
 */
export function ExpiryChip({
  expiresAt,
  today,
}: {
  expiresAt: CalendarDay | null;
  today?: CalendarDay;
}) {
  const status = useExpiryStatus(expiresAt, today);

  if (!expiresAt) return NO_VALUE;

  const date = formatDay(expiresAt);
  if (!status) return date;

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
      <StatusChip tone={status.tone} label={status.label} />
      <Box
        component="span"
        sx={{ color: 'text.secondary', typography: 'body2' }}
      >
        {date}
      </Box>
    </Box>
  );
}
