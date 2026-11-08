import { Box, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';

import { RADIUS } from '../theme/tokens';

/**
 * An icon on a tinted square or circle: a tile's, a card's, a way in's,
 * a recently opened record's (#505's 52). Square by default, its corner
 * the control's in px, since a multiple of the theme's corner grew it to
 * a circle (ADR-091); round for a row's or a panel's mark. Hidden from a
 * screen reader, as the words beside it say what it shows. Its colours
 * are the caller's, in `sx`.
 */
export function IconBadge({
  children,
  round = false,
  size = 40,
  sx,
}: {
  children: ReactNode;
  round?: boolean;
  size?: number;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      aria-hidden
      sx={[
        {
          width: size,
          height: size,
          flex: 'none',
          borderRadius: round ? '50%' : `${RADIUS.control}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
