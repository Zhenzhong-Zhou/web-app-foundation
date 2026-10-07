import { enUS, frFR, zhCN } from '@mui/material/locale';
import {
  createTheme,
  type Theme,
  type ThemeOptions,
} from '@mui/material/styles';

import type { Locale } from '../lib/locales';
import {
  BRAND,
  DARK,
  DARK_ACCENT_WEIGHT,
  FONT_STACK,
  LIGHT,
  ON_ACCENT,
  RADIUS,
  type Scheme,
  type Tone,
  type ToneName,
  towardWhite,
  TYPE,
} from './tokens';

/**
 * Two palette entries of our own, so the tones and the table surfaces are
 * CSS variables that switch with the colour mode like MUI's own.
 */
declare module '@mui/material/styles' {
  interface Palette {
    tone: Record<ToneName, Tone>;
    surface: { head: string; line: string };
  }
  interface PaletteOptions {
    tone?: Record<ToneName, Tone>;
    surface?: { head: string; line: string };
  }
}

/** px to rem against the browser's 16px, as MUI sizes its type. */
const rem = (px: number) => `${px / 16}rem`;

function palette(scheme: Scheme, accent: string, onAccent: string) {
  return {
    primary: { main: accent, contrastText: onAccent },
    success: { main: scheme.intents.success },
    warning: { main: scheme.intents.warning },
    error: { main: scheme.intents.error },
    info: { main: scheme.intents.info },
    background: { default: scheme.page, paper: scheme.surface },
    text: { primary: scheme.text, secondary: scheme.muted },
    divider: scheme.border,
    tone: scheme.tones,
    surface: { head: scheme.head, line: scheme.line },
  };
}

/** The palette as CSS variables when the theme has them, else as values. */
const paletteOf = (theme: Theme) =>
  (theme.vars ?? theme).palette as Theme['palette'];

/**
 * A chip's colour prop names a tone (ADR-055): one meaning per colour,
 * whichever module draws the chip. Primary is "in progress", the common
 * case, so it is a quiet tint rather than the brand's fill.
 */
const TONE_OF_COLOR: Record<string, ToneName> = {
  default: 'neutral',
  primary: 'info',
  secondary: 'neutral',
  info: 'info',
  success: 'positive',
  warning: 'warning',
  error: 'critical',
};

/** A fingertip, for touch screens; the mouse gets the compact sizes. */
const TOUCH = '@media (pointer: coarse)';

/**
 * CSS variables rather than runtime palette switching: the mode changes by
 * swapping a class on <html>, so nothing re-renders and there is no flash of
 * the wrong theme mid-toggle.
 *
 * colorSchemeSelector 'class' is what makes a manual toggle possible at all.
 * The default follows the OS only, which would leave 'system' as the only
 * option.
 *
 * Everything below is ADR-055's tokens (tokens.ts) given to MUI. A value
 * that is not a token does not belong here either.
 */
const options: ThemeOptions = {
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: { palette: palette(LIGHT, BRAND.accent, ON_ACCENT.light) },
    dark: {
      palette: palette(
        DARK,
        towardWhite(BRAND.accent, DARK_ACCENT_WEIGHT),
        ON_ACCENT.dark,
      ),
    },
  },
  shape: { borderRadius: RADIUS.control },
  typography: {
    fontFamily: FONT_STACK,
    fontWeightMedium: 600,
    h5: { fontSize: rem(TYPE.title), fontWeight: 700, lineHeight: 1.3 },
    h6: { fontSize: rem(TYPE.section), fontWeight: 700, lineHeight: 1.4 },
    subtitle1: { fontSize: rem(TYPE.body), fontWeight: 600 },
    body1: { fontSize: rem(TYPE.body), lineHeight: 1.45 },
    body2: { fontSize: rem(TYPE.small), lineHeight: 1.45 },
    caption: { fontSize: rem(TYPE.caption), lineHeight: 1.4 },
    // Not capitals: a label in capitals is harder to read, and Chinese
    // has none to give it.
    overline: {
      fontSize: rem(TYPE.caption),
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: 0,
      textTransform: 'none',
    },
    button: {
      fontSize: rem(TYPE.body),
      fontWeight: 600,
      textTransform: 'none',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Every digit the same width, so figures line up down a column.
        body: { fontVariantNumeric: 'tabular-nums' },
        // Chinese reads better with more room between lines.
        ':lang(zh) .MuiTypography-body1, :lang(zh) .MuiTypography-body2': {
          lineHeight: 1.65,
        },
      },
    },
    /**
     * One focus ring for everything that takes focus, instead of the
     * ripple, which was faint enough on a text button to miss. Hover and
     * the ring show what the ripple did.
     */
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: ({ theme }) => ({
          '&.Mui-focusVisible': {
            outline: `2px solid ${paletteOf(theme).primary.main}`,
            outlineOffset: 2,
          },
        }),
      },
    },
    /**
     * A button label never wraps. "New" stacked over "version" doubles the
     * button's height, which shoves its whole row taller and reads as a layout
     * bug. Rows of buttons wrap as a group instead (see RecipePanel), so a
     * narrow screen gets a second row of whole buttons, not broken ones.
     */
    MuiButton: {
      defaultProps: { variant: 'contained', disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          minHeight: 36,
          [TOUCH]: { minHeight: 44 },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: RADIUS.control, [TOUCH]: { minWidth: 44 } },
      },
    },
    // One link style: the colour says it is a link, the underline comes
    // on hover. Underlined everywhere, a list of names read as noise.
    MuiLink: { defaultProps: { underline: 'hover' } },
    /**
     * Flat: panels are told apart by a border on the tinted page, and
     * shadows are left to what floats — menus, dialogs and drawers pass
     * their own elevation. MUI's dark-mode overlay is off, since the dark
     * surfaces are already chosen.
     */
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        rounded: { borderRadius: RADIUS.panel },
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: RADIUS.dialog } },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: RADIUS.panel } },
    },
    /**
     * A tinted chip with its tone's text, in both modes. The words carry
     * the meaning; the tone only says which kind it is.
     */
    MuiChip: {
      styleOverrides: {
        root: ({ ownerState, theme }) => {
          const name = TONE_OF_COLOR[ownerState.color ?? 'default'];
          const tone = paletteOf(theme).tone[name ?? 'neutral'];

          return {
            fontWeight: 600,
            color: tone.fg,
            backgroundColor:
              ownerState.variant === 'outlined' ? 'transparent' : tone.bg,
            border: `1px solid ${tone.border}`,
            '& .MuiChip-icon, & .MuiChip-deleteIcon': { color: 'inherit' },
          };
        },
      },
    },
    /**
     * Tables scroll inside a TableContainer rather than wrapping into
     * nonsense (every table is wrapped in one). What must never wrap:
     *
     * - Right-aligned cells. In this app those are the numbers, the money and
     *   the actions column, and "222.0000" broken across lines, or "Close"
     *   above "short", is worse than a scrollbar.
     *
     * Button labels are covered app-wide by MuiButton above.
     *
     * Left-aligned text — names, notes, reasons — keeps wrapping, because a
     * long partner name should grow the row, not push the table sideways.
     * Set here once so a new table gets it without anyone remembering.
     *
     * Heads are tinted and quieter than the rows, so the labels stand
     * apart from the figures; rows are taller under a finger.
     */
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderBottomColor: paletteOf(theme).surface.line,
          '&.MuiTableCell-alignRight': { whiteSpace: 'nowrap' },
          [TOUCH]: { paddingTop: 12, paddingBottom: 12 },
        }),
        head: ({ theme }) => ({
          fontSize: rem(TYPE.small),
          fontWeight: 600,
          color: paletteOf(theme).text.secondary,
          backgroundColor: paletteOf(theme).surface.head,
          borderBottomColor: paletteOf(theme).divider,
          whiteSpace: 'nowrap',
        }),
      },
    },
  },
};

/** MUI's own words in each language: Simplified Chinese is zhCN. */
const MUI_LOCALES = { en: enUS, 'fr-CA': frFR, 'zh-Hans': zhCN };

const themes = new Map<Locale, Theme>();

/**
 * The theme in a language (ADR-054): the same design, with MUI's built-in
 * text — pagination, "No options", "Close" — in it. Built once per
 * language and kept, so switching back costs nothing.
 */
export function themeFor(locale: Locale): Theme {
  let theme = themes.get(locale);
  if (!theme) {
    theme = createTheme(options, MUI_LOCALES[locale]);
    themes.set(locale, theme);
  }
  return theme;
}
