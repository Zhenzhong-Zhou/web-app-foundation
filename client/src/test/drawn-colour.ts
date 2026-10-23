import type { CssVarsTheme, Theme } from '@mui/material/styles';

import { themeFor } from '../theme';

/**
 * The colour an element was drawn with, in a colour mode, as #RRGGBB, so
 * a spec can measure its contrast (theme/accent.ts) as a person would see
 * it. jsdom reports the theme's CSS variable rather than the colour
 * (`var(--mui-palette-tone-info-fg)`), so it is looked up in the app's own
 * palette for that mode; MUI's derived shades are kept there as rgb().
 *
 * Anything that is not a colour from the theme throws: an element drawn
 * with none measures nothing, and a translucent one needs its ground.
 */
export function drawnIn(mode: 'light' | 'dark', value: string): string {
  const variable = /^var\(--mui-palette-([\w-]+)\)$/.exec(value);
  if (!variable) throw new Error(`Not drawn from the theme: ${value}`);

  // Built with CSS variables (theme/index.ts), so it has each mode's own.
  const theme = themeFor('en') as Theme & Pick<CssVarsTheme, 'colorSchemes'>;
  let colour: unknown = theme.colorSchemes[mode]?.palette;
  for (const key of variable[1].split('-')) {
    colour = (colour as Record<string, unknown> | undefined)?.[key];
  }
  if (typeof colour !== 'string') {
    throw new Error(`No colour ${variable[1]} in the ${mode} palette`);
  }

  if (/^#[0-9A-Fa-f]{6}$/.test(colour)) return colour.toUpperCase();
  const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(colour);
  if (!rgb) throw new Error(`Translucent, or not #RRGGBB or rgb(): ${colour}`);
  return `#${rgb
    .slice(1)
    .map((channel) => Number(channel).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}
