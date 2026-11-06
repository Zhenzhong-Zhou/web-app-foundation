import type { Theme } from '@mui/material/styles';

/** The palette as CSS variables when the theme has them, else as values. */
const paletteOf = (theme: Theme) =>
  (theme.vars ?? theme).palette as Theme['palette'];

/**
 * A held column's left edge while columns pass under it (ADR-091's
 * review): a line in the edge token, and the column cut under it fading
 * into the held cell's own ground, so "200" cut to "20" does not read as
 * a smaller number. For a sticky cell, which holds its `::before`.
 */
export function cutEdge(theme: Theme, ground: 'head' | 'paper') {
  const palette = paletteOf(theme);
  const fill =
    ground === 'head' ? palette.surface.head : palette.background.paper;
  return {
    boxShadow: `inset 1px 0 0 ${palette.surface.edge}`,
    '&::before': {
      content: '""',
      position: 'absolute' as const,
      top: 0,
      bottom: 0,
      right: '100%',
      width: 24,
      pointerEvents: 'none' as const,
      background: `linear-gradient(to right, transparent, ${fill})`,
    },
  };
}

/**
 * A table frame that scrolls sideways shows where it cuts (ADR-091's
 * review): a shade at the side with more, drawn on the frame's own
 * background and covered once that side is reached, so no script asks.
 * Cells with a ground of their own, the heads and held columns, cover it.
 */
export function scrollShades(theme: Theme) {
  const palette = paletteOf(theme);
  const cover = palette.background.paper;
  const shade = palette.surface.edge;
  return {
    background: [
      `linear-gradient(to right, ${cover} 30%, transparent) left center / 40px 100% no-repeat local`,
      `linear-gradient(to left, ${cover} 30%, transparent) right center / 40px 100% no-repeat local`,
      `linear-gradient(to right, ${shade}, transparent) left center / 12px 100% no-repeat scroll`,
      `linear-gradient(to left, ${shade}, transparent) right center / 12px 100% no-repeat scroll`,
    ].join(', '),
  };
}
