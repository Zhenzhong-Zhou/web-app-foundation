import { Box } from '@mui/material';

import type { ReorderStatus } from '../lib/api-names';
import { rem } from '../theme/rem';
import { barFill } from './reorder-points';

/**
 * The bar beside a position (ADR-085): its scale twice the point, so the
 * mark in the middle is the point. Filled amber when low, green when not;
 * empty and outlined red when out. Hidden from screen readers, since the
 * number beside it says it. The list's rows and the dialog's Today draw
 * it alike.
 */
export function PositionBar({
  position,
  point,
  status,
}: {
  position: string;
  point: string;
  status: ReorderStatus;
}) {
  const out = status === 'out';

  return (
    <Box
      aria-hidden
      sx={{
        position: 'relative',
        width: rem(120),
        height: 8,
        borderRadius: 999,
        bgcolor: 'action.hover',
        ...(out && { outline: 1, outlineColor: 'error.main' }),
      }}
    >
      <Box
        sx={{
          width: `${barFill(position, point)}%`,
          height: '100%',
          borderRadius: 999,
          bgcolor: status === 'low' ? 'warning.main' : 'success.main',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: -3,
          bottom: -3,
          width: 2,
          bgcolor: 'text.primary',
        }}
      />
    </Box>
  );
}
