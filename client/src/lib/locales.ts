/**
 * The languages the app speaks (ADR-054), as BCP 47 tags. English is the
 * source every catalogue is translated from and what anything missing falls
 * back to.
 *
 * The server keeps the same list (server/src/common/locales.ts), since the
 * two packages share no files; server/scripts/check-client-locales.js fails
 * CI when they disagree.
 */
export const SUPPORTED_LOCALES = ['en', 'fr-CA', 'zh-Hans'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Each language in its own name, never translated: someone looking for
 * 简体中文 in a French menu should find it as they would write it.
 */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  'fr-CA': 'Français (Canada)',
  'zh-Hans': '简体中文',
};

export function isLocale(value: unknown): value is Locale {
  return (SUPPORTED_LOCALES as readonly unknown[]).includes(value);
}

/** A browser tag as Intl understands it in full, or null if malformed. */
function maximized(tag: string): Intl.Locale | null {
  try {
    return new Intl.Locale(tag).maximize();
  } catch {
    return null;
  }
}

/**
 * The supported language a browser tag means: any English is `en`, any
 * French `fr-CA`, and Chinese written in Simplified characters `zh-Hans`
 * (zh-CN and zh-SG are; zh-TW and zh-HK are Traditional, which ADR-054
 * defers). Null for anything else.
 */
export function matchLocale(tag: string): Locale | null {
  const locale = maximized(tag);
  if (!locale) return null;

  switch (locale.language) {
    case 'en':
      return 'en';
    case 'fr':
      return 'fr-CA';
    case 'zh':
      return locale.script === 'Hans' ? 'zh-Hans' : null;
    default:
      return null;
  }
}

/** The first of the browser's languages the app speaks, else English. */
export function browserLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/**
 * The tag dates, numbers and money are formatted with: the browser's own
 * when it is the same language and script, so an English reader in Britain
 * keeps "10 Oct 2026" and one in the United States "Oct 10, 2026", exactly
 * as before ADR-054; otherwise the language itself.
 */
export function formattingLocale(
  locale: Locale,
  languages: readonly string[],
): string {
  const wanted = maximized(locale);

  for (const tag of languages) {
    const candidate = maximized(tag);
    if (
      candidate &&
      wanted &&
      candidate.language === wanted.language &&
      candidate.script === wanted.script
    ) {
      return tag;
    }
  }

  return locale;
}
