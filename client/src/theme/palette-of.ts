import type { Theme } from '@mui/material/styles';

/** The palette as CSS variables when the theme has them, else as values. */
export const paletteOf = (theme: Theme) =>
  (theme.vars ?? theme).palette as Theme['palette'];
