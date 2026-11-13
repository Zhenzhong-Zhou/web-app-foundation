import {
  type Locale,
  PSEUDO_LOCALE,
  type ScreenLocale,
  serverLocale,
} from '../lib/locales';
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
 * size with the words at 14 px (ADR-091's review), since they differ most: Chinese's two characters each sit
 * inside the 44 px target, where "Notifications" and « Rechercher » do
 * not. In rem, so it grows with the text size (ADR-075): Chinese keeps its
 * words at Larger on a phone 390 px wide, where one threshold for all,
 * French's, left the icons alone (ADR-091's review). Narrower, the icons
 * stand alone, each named as before, and every target keeps its 44 px
 * (ADR-079).
 *
 * en-XA, the pseudo-language, has its own, measured as the others are,
 * since its words are about 40 % longer than English's (ADR-054's November
 * 2026 amendment, R9): with English's, its bar ran past a 390 px phone. In
 * development and the browser tests only, as the language is: a production
 * build drops the entry with it (vite.config.ts's `withoutPseudoLanguage`).
 */
const WORDS_NEED: Record<Locale, number> &
  Partial<Record<ScreenLocale, number>> = {
  en: 316,
  'fr-CA': 340,
  'zh-Hans': 262,
  ...(import.meta.env.DEV ? { [PSEUDO_LOCALE]: 497 } : {}),
};

/** The container query under which the words of the screens' language show. */
export function wordsFit(shown: ScreenLocale): string {
  const need = WORDS_NEED[shown] ?? WORDS_NEED[serverLocale(shown)];
  return `@container ${BAR_CONTAINER} (min-width: ${rem(need)})`;
}

/** What the toolbar sets, so its targets can measure it. */
export const BAR_SX = {
  containerType: 'inline-size',
  containerName: BAR_CONTAINER,
} as const;
