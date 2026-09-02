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
  },
});
