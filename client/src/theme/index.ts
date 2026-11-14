import { enUS, frFR, zhCN } from '@mui/material/locale';
import {
  createTheme,
  type Theme,
  type ThemeOptions,
} from '@mui/material/styles';
import { createElement } from 'react';

import type { Locale } from '../lib/locales';
import { returnFocus } from '../lib/open-dialog';
import { VersionPaper } from '../version/version-paper';
import { type Brand, DEFAULT_BRAND } from './brand-store';
import { scrollShades } from './cut-edge';
import { TOUCH } from './media';
import { OptionGroup } from './option-group';
import { rem } from './rem';
import {
  accentHover,
  CHOSEN_WEIGHT,
  DARK,
  DARK_ACCENT_WEIGHT,
  FONT_STACK,
  LIGHT,
  mix,
  ON_ACCENT,
  RADIUS,
  type Rail,
  RAILS,
  type Scheme,
  type Tonal,
  type Tone,
  type ToneName,
  towardWhite,
  TYPE,
} from './tokens';

/**
 * Palette entries of our own, so the tones, the table surfaces, the lift's
 * shadow and the tonal buttons are CSS variables that switch with the
 * colour mode like MUI's own.
 */
declare module '@mui/material/styles' {
  interface Palette {
    tone: Record<ToneName, Tone>;
    surface: {
      head: string;
      line: string;
      edge: string;
      chosen: string;
      lift: string;
    };
    tonal: Tonal;
    rail: Rail;
  }
  interface PaletteOptions {
    tone?: Record<ToneName, Tone>;
    surface?: {
      head: string;
      line: string;
      edge: string;
      chosen: string;
      lift: string;
    };
    tonal?: Tonal;
    rail?: Rail;
  }
}

function palette(
  scheme: Scheme,
  accent: string,
  onAccent: string,
  mode: 'light' | 'dark',
  rail: Rail,
) {
  return {
    rail,
    // dark: a main button under the pointer, moved away from its text (#557).
    primary: {
      main: accent,
      dark: accentHover(accent, mode),
      contrastText: onAccent,
    },
    success: { main: scheme.intents.success },
    warning: { main: scheme.intents.warning },
    error: { main: scheme.intents.error },
    info: { main: scheme.intents.info },
    background: { default: scheme.page, paper: scheme.surface },
    text: { primary: scheme.text, secondary: scheme.muted },
    divider: scheme.border,
    tone: scheme.tones,
    tonal: scheme.tonal,
    surface: {
      head: scheme.head,
      line: scheme.line,
      edge: scheme.edge,
      chosen: mix(accent, scheme.surface, CHOSEN_WEIGHT),
      lift: scheme.lift,
    },
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

/**
 * Muted text drawn in the main text colour, inside the element this is set
 * on. MUI's tint for an option the keyboard is on, or one selected, takes
 * muted text below AA (4.13 : 1 on a selected option the keyboard is on,
 * in dark mode), so there a secondary line reads as the main one: the
 * tint, not the line, shows which entry it is (#196). Every muted line
 * reads the one variable, so this reaches them without a rule on a screen.
 */
const mutedAsMain = (theme: Theme) => ({
  '--mui-palette-text-secondary': paletteOf(theme).text.primary,
});

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
const optionsFor = (brand: Brand, locale: Locale): ThemeOptions => ({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: palette(
        LIGHT,
        brand.accent,
        ON_ACCENT.light,
        'light',
        RAILS[brand.rail].light,
      ),
    },
    dark: {
      palette: palette(
        DARK,
        towardWhite(brand.accent, DARK_ACCENT_WEIGHT),
        ON_ACCENT.dark,
        'dark',
        RAILS[brand.rail].dark,
      ),
    },
  },
  shape: { borderRadius: RADIUS.control },
  /**
   * Each size on its line, 25 on 32, 20 on 28, 16 on 24 and 14 on 20, a
   * 4 px grid at the Standard text size (ADR-091). Written as a share of
   * the size, so the line grows with the person's text size (ADR-075).
   */
  typography: {
    fontFamily: FONT_STACK,
    fontWeightMedium: 600,
    h5: {
      fontSize: rem(TYPE.title),
      fontWeight: 700,
      lineHeight: 32 / TYPE.title,
    },
    h6: {
      fontSize: rem(TYPE.section),
      fontWeight: 700,
      lineHeight: 28 / TYPE.section,
    },
    subtitle1: { fontSize: rem(TYPE.body), fontWeight: 600 },
    // Chinese reads better with more room between lines, for its strokes:
    // 16 on 28 and 14 on 24, on the same 4 px grid. Set on the variants
    // themselves, so a table's cells, a menu's items and a button take it
    // too, not only Typography (ADR-091's review).
    body1: {
      fontSize: rem(TYPE.body),
      lineHeight: (locale === 'zh-Hans' ? 28 : 24) / TYPE.body,
    },
    body2: {
      fontSize: rem(TYPE.small),
      lineHeight: (locale === 'zh-Hans' ? 24 : 20) / TYPE.small,
    },
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
        /**
         * Less motion for those who ask (ADR-075): transitions end at once
         * and scrolling jumps, so the drawer, menus, dialogs and the
         * gallery's zoom appear rather than slide, fade or ease. Animations
         * are left running: a spinner or a skeleton says something is still
         * happening, and stopped it would read as stuck. MUI ends its
         * transitions on a timer, not on transitionend, so onExited still
         * fires.
         */
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            transitionDuration: '0.01ms !important',
            transitionDelay: '0s !important',
            scrollBehavior: 'auto !important',
          },
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
     * A switch's track while off, in the edge's grey at full strength,
     * seen at 3:1 on a panel in both modes (WCAG 1.4.11), where MUI's own
     * pale track was about 2.7:1. On and disabled, MUI's own rules, the
     * more specific, still draw it.
     */
    MuiSwitch: {
      styleOverrides: {
        track: ({ theme }) => ({
          backgroundColor: paletteOf(theme).surface.edge,
          opacity: 1,
        }),
      },
    },
    /**
     * A button never shrinks to fit its row, so its label never wraps to make
     * room: "New" stacked over "version" doubles the button's height, which
     * shoves its whole row taller and reads as a layout bug. Rows of buttons
     * wrap as a group instead (see RecipePanel), so a narrow screen gets a
     * second row of whole buttons, not broken ones.
     *
     * The one exception is a label wider than all the space it has, which a
     * long label on a phone at a larger text size is (ADR-075): capped at
     * its container's width, it breaks onto a second line rather than
     * running off the screen. In a table cell never; the table scrolls.
     */
    MuiButton: {
      defaultProps: { variant: 'contained', disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          flexShrink: 0,
          maxWidth: '100%',
          textAlign: 'center',
          '.MuiTableCell-root &': { whiteSpace: 'nowrap' },
          minHeight: 36,
          [TOUCH]: { minHeight: 44 },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        // A fingertip each way on touch (ADR-079), Home's Refresh among
        // them, which an icon's own 40 px left short (ADR-091's review).
        root: {
          borderRadius: RADIUS.control,
          [TOUCH]: { minWidth: 44, minHeight: 44 },
        },
      },
    },
    // One link style: the colour says it is a link, the underline comes
    // on hover. Underlined everywhere, a list of names read as noise. A
    // link inside a sentence is the exception, underline="always", since
    // colour alone does not tell it from the words around it (WCAG 1.4.1).
    MuiLink: { defaultProps: { underline: 'hover' } },
    /**
     * The quick filters' unpressed text in the muted tone rather than MUI's
     * 54% black, which on the tinted page is 4.4:1, under AA's 4.5.
     */
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => ({ color: paletteOf(theme).text.secondary }),
      },
    },
    /**
     * An empty date field shows no format until it is typed in (#512). The
     * browser writes one in its own language, whatever the screen's,
     * yyyy-mm-dd beside Chinese labels, and Safari today's date in grey,
     * as if one were chosen. Its calendar icon stays, so it still reads as
     * a date, and on focus the format comes back, where typing needs it.
     * Only a field the screen holds empty, its value '': one it does not
     * hold says nothing of its value, and is drawn as the browser draws it.
     */
    MuiInputBase: {
      styleOverrides: {
        input: ({ ownerState }) =>
          ownerState.type === 'date' &&
          ownerState.value === '' &&
          !ownerState.focused
            ? { WebkitTextFillColor: 'transparent' }
            : {},
      },
    },
    /**
     * A disabled field's helper text says why it cannot be changed, so it
     * stays readable rather than fading with the field: the field itself is
     * exempt from contrast, its explanation is not.
     */
    MuiFormHelperText: {
      styleOverrides: {
        root: ({ theme }) => ({
          // Read to fill the field in: the small size, never a caption
          // (ADR-090, Text and targets; ADR-091's review).
          fontSize: rem(TYPE.small),
          lineHeight: 20 / TYPE.small,
          '&.Mui-disabled': { color: paletteOf(theme).text.secondary },
        }),
      },
    },
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
    /**
     * Focus goes back to the button that opened a dialog or a drawer once it
     * has closed (lib/open-dialog.ts, #155). A dialog passing its own
     * transition onExited would replace this one; none does.
     *
     * Every dialog's paper is drawn as VersionPaper, which puts the amber
     * line at its top once this tab's saves would be refused (ADR-081).
     */
    MuiDialog: {
      defaultProps: {
        slotProps: {
          transition: returnFocus,
          paper: { component: VersionPaper },
        },
      },
      styleOverrides: { paper: { borderRadius: RADIUS.dialog } },
    },
    MuiDrawer: {
      defaultProps: { slotProps: { transition: returnFocus } },
    },
    /**
     * A dialog's buttons wrap onto a second line at the right when the row
     * is wider than the dialog, rather than running past its edge: on a
     * phone at Larger text, French's Annuler and Ajouter un emplacement are
     * (ADR-075). Each button stays whole, as MuiButton keeps it.
     */
    MuiDialogActions: {
      styleOverrides: { root: { flexWrap: 'wrap', rowGap: 8 } },
    },
    /**
     * An option under the pointer or the keyboard, and the one chosen: in
     * the lookup and the pickers, their secondary lines in the main text
     * colour (mutedAsMain). A bell entry the keyboard is on, likewise.
     *
     * Options under a heading are the listbox's group, named by it
     * (option-group.tsx): the lookup's kinds, the time zone's This device.
     */
    MuiAutocomplete: {
      defaultProps: {
        renderGroup: (params) => createElement(OptionGroup, params),
      },
      styleOverrides: {
        option: ({ theme }) => ({
          '&.Mui-focused, &[aria-selected="true"]': mutedAsMain(theme),
        }),
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: ({ theme }) => ({ '&.Mui-focusVisible': mutedAsMain(theme) }),
      },
    },
    /**
     * A banner's actions drop below its message when the two do not fit
     * side by side, rather than pushing the page wider than the screen
     * (found by text-size.spec at 320px). The message keeps a floor beside
     * the icon, so it is not squeezed to a column of words first; the
     * actions sit at the right on their own line.
     */
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: RADIUS.panel, flexWrap: 'wrap' },
        message: { flex: '1 1 0', minWidth: `min(${rem(160)}, 100%)` },
        action: { maxWidth: '100%' },
      },
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
            // A status or a filter read to decide by: the small size at
            // least, as its neighbours are (ADR-091's review).
            fontSize: rem(TYPE.small),
            fontWeight: 600,
            color: tone.fg,
            backgroundColor:
              ownerState.variant === 'outlined' ? 'transparent' : tone.bg,
            border: `1px solid ${tone.border}`,
            '& .MuiChip-icon, & .MuiChip-deleteIcon': { color: 'inherit' },
            // A chip that does something is a fingertip on touch, its ×
            // too, which MUI draws at 22 px (ADR-079).
            '&.MuiChip-clickable, &.MuiChip-deletable': {
              [TOUCH]: { minHeight: 44 },
            },
            '& .MuiChip-deleteIcon': {
              [TOUCH]: {
                boxSizing: 'content-box',
                fontSize: 24,
                padding: 10,
                margin: '0 -6px 0 -6px',
              },
            },
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
    // Every table frame that scrolls sideways shows where it cuts.
    MuiTableContainer: {
      styleOverrides: { root: ({ theme }) => scrollShades(theme) },
    },
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
});

/** MUI's own words in each language: Simplified Chinese is zhCN. */
const MUI_LOCALES = { en: enUS, 'fr-CA': frFR, 'zh-Hans': zhCN };

const themes = new Map<string, Theme>();

/**
 * The theme in a language (ADR-054) and an organization's look (ADR-060):
 * the same design, with MUI's built-in text — pagination, "No options",
 * "Close" — in the language, and the organization's accent and rail.
 * Built once per pair and kept, so switching back costs nothing.
 */
export function themeFor(locale: Locale, brand: Brand = DEFAULT_BRAND): Theme {
  const key = `${locale} ${brand.accent} ${brand.rail}`;
  let theme = themes.get(key);
  if (!theme) {
    theme = createTheme(optionsFor(brand, locale), MUI_LOCALES[locale]);
    themes.set(key, theme);
  }
  return theme;
}
