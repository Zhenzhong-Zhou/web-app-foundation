import type { SxProps, Theme } from '@mui/material';

/** A button beside the main one: filled in a neutral tint, not the accent. */
export const TONAL = {
  bgcolor: 'tone.neutral.bg',
  color: 'text.primary',
  '&:hover': { bgcolor: 'tone.neutral.border' },
} satisfies SxProps<Theme>;
