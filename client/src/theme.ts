import { createTheme } from '@mui/material/styles';

/**
 * CSS variables rather than runtime palette switching: the mode changes by
 * swapping a class on <html>, so nothing re-renders and there is no flash of
 * the wrong theme mid-toggle.
 *
 * colorSchemeSelector 'class' is what makes a manual toggle possible at all.
 * The default follows the OS only, which would leave 'system' as the only
 * option.
 */
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: { light: true, dark: true },
  // System stack rather than MUI's default Roboto, which is not installed —
  // no network request, no font-loading flash, and it looks native on each
  // platform.
  typography: { fontFamily: 'system-ui, sans-serif' },
  components: {
    MuiButton: {
      defaultProps: { variant: 'contained' },
      styleOverrides: { root: { textTransform: 'none' } },
    },
    /**
     * Tables scroll inside a TableContainer rather than wrapping into
     * nonsense (every table is wrapped in one). What must never wrap:
     *
     * - Right-aligned cells. In this app those are the numbers, the money and
     *   the actions column, and "222.0000" broken across lines, or "Close"
     *   above "short", is worse than a scrollbar.
     * - A button label anywhere in a table, for the same reason.
     *
     * Left-aligned text — names, notes, reasons — keeps wrapping, because a
     * long partner name should grow the row, not push the table sideways.
     * Set here once so a new table gets it without anyone remembering.
     */
    MuiTableCell: {
      styleOverrides: {
        root: {
          '&.MuiTableCell-alignRight': { whiteSpace: 'nowrap' },
          '& .MuiButton-root': { whiteSpace: 'nowrap' },
        },
      },
    },
  },
});
