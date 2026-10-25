import { useLanguage } from '../i18n/use-language';
import type { Locale } from './locales';

/**
 * The product's name in each language (ADR-082): its own setting, such as
 * VITE_APP_NAME_ZH_HANS, else VITE_APP_NAME, else its default. Compiled in
 * by vite.config.ts's app-name plugin, and by vitest.config.ts for the
 * component tests.
 */
declare const __APP_NAMES__: Record<Locale, string>;

/** "© 2026 Zhenzhong (Bob) Zhou", from VITE_COPYRIGHT_HOLDER, compiled in beside it. */
declare const __COPYRIGHT__: string | null;

/**
 * The product's name in a language, for the tabs and the marks: never
 * translated, only set. Read at each call, so a test can set it
 * (vi.stubGlobal).
 */
export function appNameIn(locale: Locale): string {
  return __APP_NAMES__[locale];
}

/** The product's name in the reader's language. */
export function useAppName(): string {
  return appNameIn(useLanguage().locale);
}

/**
 * The © line, or null where no holder is set, as on a fork: no line rather
 * than someone else's name. Read at each call, as the names are.
 */
export function copyrightLine(): string | null {
  return __COPYRIGHT__;
}
