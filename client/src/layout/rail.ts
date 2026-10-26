import type { Theme } from '@mui/material/styles';

import { rem } from '../theme/rem';

/**
 * The rail open, then folded to its icons (ADR-055). In rem, so it widens
 * with the text size and a label is cut where it is at Standard (ADR-075);
 * the icons are rem too, so the folded rail grows with them.
 *
 * A file of its own: side-nav.tsx exports components, and fast refresh
 * needs such a file to export nothing else but literals.
 */
export const RAIL_WIDTH = rem(232);
export const RAIL_FOLDED_WIDTH = rem(64);

/**
 * A window too short to spare the foot its own place: a phone held
 * sideways is about 340 px tall. Below about 500 px the rail and the menu
 * drawer scroll as one, the foot after the links, so the links keep the
 * room; above it the foot is pinned, in view at any height (ADR-082).
 */
export const SHORT_WINDOW = '@media (max-height: 499.98px)';

/**
 * The links fading into the rail just above its foot while more of them
 * run on under it (useMoreBelow), so the rail reads as one that scrolls
 * (ADR-082): a fade, since a shadow hardly shows on the dark rail. On the
 * foot, which is positioned.
 */
export const RAIL_MORE_BELOW = (theme: Theme) => ({
  '&::before': {
    content: '""',
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    height: 28,
    // The rail's colour as its CSS variable, so it switches with the rail.
    background: `linear-gradient(transparent, ${((theme.vars ?? theme).palette as Theme['palette']).rail.bg})`,
    pointerEvents: 'none',
  },
});

/**
 * A focus ring on the rail, in its strongest colour, for its own stops:
 * the folded mark at its foot, the plate, the organization's link and the
 * fold button at its top, and the menu drawer's Close. The theme's ring,
 * the accent, is 2.24 : 1 on the dark rail (#246).
 */
export const RAIL_FOCUS_RING = {
  outline: '2px solid',
  outlineColor: 'rail.strong',
  outlineOffset: 2,
} as const;
