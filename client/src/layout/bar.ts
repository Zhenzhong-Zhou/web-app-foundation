import { rem } from '../theme/rem';

/**
 * Where the rail appears (ADR-055). Below it the same groups open in a
 * drawer behind Menu, so narrowing the window moves the links and never
 * hides one, and the top bar's icons carry their words (ADR-091).
 *
 * The rail replaced a top bar that ran out of room: seven links, the
 * organization's name and two icons measured a little over 1000px, French
 * had about 30px to spare at 1280, and the lot trace, the settings and an
 * organization's logo still needed a place.
 */
export const BAR = 'lg' as const;

/** The top bar's toolbar, as the container its words measure (BAR_SX). */
const BAR_CONTAINER = 'bar';

/**
 * The bar's width, inside its gutters, from which Menu, Search, Help,
 * Notifications and Account fit with their words beside the
 * organization's initials, in French, the widest: 320 px at the standard
 * text size, so from a phone 360 px wide; in rem, so it grows with the
 * text size (ADR-075). Narrower, the icons stand alone, each named as
 * before, and every target keeps its 44 px (ADR-079).
 */
export const WORDS_FIT = `@container ${BAR_CONTAINER} (min-width: ${rem(320)})`;

/** What the toolbar sets, so its targets can measure it. */
export const BAR_SX = {
  containerType: 'inline-size',
  containerName: BAR_CONTAINER,
} as const;
