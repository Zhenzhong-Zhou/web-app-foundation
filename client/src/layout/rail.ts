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
 * A focus ring on the rail, in its strongest colour, for its own stops:
 * the folded mark at its foot, the plate and the organization's link at
 * its top.
 */
export const RAIL_FOCUS_RING = {
  outline: '2px solid',
  outlineColor: 'rail.strong',
  outlineOffset: 2,
} as const;
