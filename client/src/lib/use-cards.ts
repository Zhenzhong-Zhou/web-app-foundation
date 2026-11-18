import { useMediaQuery, useTheme } from '@mui/material';

/**
 * Whether a list shows its rows as cards: below 600 px, MUI's `sm`
 * (the design language's Lists on a phone). The one exception to CSS
 * `display` deciding what shows (ADR-090's width switch): a list whose
 * table and cards would each draw every row would draw them twice, one
 * copy hidden. `noSsr` gives the first draw the width, so it is never the
 * wrong one first.
 */
export function useCards(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
}
