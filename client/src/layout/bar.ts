import type { Locale } from '../lib/locales';
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
 * organization's initials, measured in each language at the standard text
 * size, since their words differ most: Chinese's two characters each sit
 * inside the 44 px target, where "Notifications" and « Rechercher » do
 * not. In rem, so it grows with the text size (ADR-075): Chinese keeps its
 * words at Larger on a phone 390 px wide, where one threshold for all,
 * French's, left the icons alone (ADR-091's review). Narrower, the icons
 * stand alone, each named as before, and every target keeps its 44 px
 * (ADR-079).
 */
const WORDS_NEED: Record<Locale, number> = {
  en: 300,
  'fr-CA': 320,
  'zh-Hans': 262,
};

/** The container query under which a language's words show. */
export function wordsFit(locale: Locale): string {
  const need = WORDS_NEED[locale];
  return `@container ${BAR_CONTAINER} (min-width: ${rem(need)})`;
}

/** What the toolbar sets, so its targets can measure it. */
export const BAR_SX = {
  containerType: 'inline-size',
  containerName: BAR_CONTAINER,
} as const;
