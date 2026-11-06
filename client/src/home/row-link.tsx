import { ButtonBase, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { HOVER } from '../theme/media';

/**
 * One whole row as one link, Home's way (ADR-091): Getting started's
 * steps, the first week's items and Recently opened's records. Tinted
 * under a mouse alone, never left tinted after a tap (ADR-091's review).
 */
export function RowLink({
  to,
  state,
  sx,
  children,
}: {
  to: string;
  state?: unknown;
  sx: SxProps<Theme>;
  children: ReactNode;
}) {
  return (
    <ButtonBase
      component={RouterLink}
      to={to}
      state={state}
      sx={[
        ...(Array.isArray(sx) ? sx : [sx]),
        { [HOVER]: { '&:hover': { bgcolor: 'action.hover' } } },
      ]}
    >
      {children}
    </ButtonBase>
  );
}
