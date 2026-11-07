import type { SxProps, Theme } from '@mui/material';

/** A button beside the main one: the tonal token's fill, not the accent. */
export const TONAL = {
  bgcolor: 'tonal.bg',
  color: 'tonal.fg',
  '&:hover': { bgcolor: 'tonal.hover' },
} satisfies SxProps<Theme>;
