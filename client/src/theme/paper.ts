import { createTheme } from '@mui/material/styles';

/**
 * Printed documents' own theme (ADR-055): the packing slip, the invoice
 * and the credit note render inside it, apart from the screen's.
 *
 * Light only, and the look they printed with before the screen changed:
 * the system font and MUI's own sizes and colours. Paper is a record a
 * customer keeps, so a redesign of the screens must not reach it, and a
 * dark screen must not print grey on white. Nothing here comes from the
 * screen's tokens, on purpose.
 */
export const PAPER_THEME = createTheme({
  palette: { mode: 'light' },
  typography: { fontFamily: 'system-ui, sans-serif' },
  components: {
    MuiButton: {
      styleOverrides: { root: { textTransform: 'none' } },
    },
    // Figures and money never break across lines, on paper as on screen.
    MuiTableCell: {
      styleOverrides: {
        root: { '&.MuiTableCell-alignRight': { whiteSpace: 'nowrap' } },
      },
    },
  },
});
