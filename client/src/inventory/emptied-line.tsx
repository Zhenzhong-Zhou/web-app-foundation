import { Typography } from '@mui/material';
import { useIntl } from 'react-intl';

import type { StockPile } from '../api/types.gen';
import { formatDay } from '../lib/format';

/**
 * "Emptied 14 Nov 2026" under an emptied lot, the organization's day its
 * last change left none (ADR-093 v3); nothing while it holds stock.
 */
export function EmptiedLine({ pile }: { pile: StockPile }) {
  const intl = useIntl();
  if (!pile.emptiedOn || pile.quantity !== '0.0000') return null;

  return (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {intl.formatMessage(
        { id: 'inventory.stock.emptiedOn', defaultMessage: 'Emptied {day}' },
        { day: formatDay(pile.emptiedOn) },
      )}
    </Typography>
  );
}
