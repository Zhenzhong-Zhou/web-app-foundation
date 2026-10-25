import type { Locale } from './locales';

/**
 * The product's name in each language (ADR-082): its own setting, such as
 * VITE_APP_NAME_ZH_HANS, else VITE_APP_NAME, else its default. Compiled in
 * by vite.config.ts's app-name plugin, and by vitest.config.ts for the
 * component tests.
 */
declare const __APP_NAMES__: Record<Locale, string>;

/**
 * The product's name in a language, for the tabs and the marks: never
 * translated, only set. Read at each call, so a test can set it
 * (vi.stubGlobal).
 */
export function appNameIn(locale: Locale): string {
  return __APP_NAMES__[locale];
}
