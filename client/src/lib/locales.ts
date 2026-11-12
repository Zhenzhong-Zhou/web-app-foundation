import { Locale } from '../api/types.gen';

/**
 * The languages the app speaks (ADR-054), as BCP 47 tags, in the server's
 * order. English is the source every catalogue is translated from and what
 * anything missing falls back to.
 *
 * Generated from the server's OpenAPI document (ADR-068), so the list the
 * client offers is the list the server accepts.
 */
export const SUPPORTED_LOCALES: readonly Locale[] = Object.values(Locale);

export type { Locale };

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

/**
 * Where a language is offered to read the app in, its name says when its
 * translations have not been reviewed by someone fluent (MC-1405), in that
 * language's own words, so a reader expects rough wording before choosing
 * it. Empty for a reviewed language: delete a language's entry once its
 * review is imported, and the mark is gone everywhere.
 *
 * Only the language picker shows it. A document's languages and required
 * name languages are the customer's settings, not a choice of how to read
 * the app, and keep the plain names.
 */
export const UNREVIEWED_MARK: Partial<Record<Locale, string>> = {
  'fr-CA': ' — bêta',
  'zh-Hans': '（测试版）',
};

/** A language's name as the picker offers it. */
export function pickerName(locale: Locale): string {
  return LANGUAGE_NAMES[locale] + (UNREVIEWED_MARK[locale] ?? '');
}

/**
 * Chinese names the language a name or a text is written in 英文, 法文 and
 * 中文, as the exports' columns do (英文名称) and ADR-054's November 2026
 * amendment says; Intl's 英语 and 法语 name the language as spoken or
 * learned. The glossary says so; the server's `languageWord` holds the
 * same three.
 */
const WRITTEN_IN_CHINESE: Record<Locale, string> = {
  en: '英文',
  'fr-CA': '法文',
  'zh-Hans': '中文',
};

/**
 * A language named in the reader's language inside a sentence, from its
 * language alone: Chinese, chinois, 中文 for zh-Hans (ADR-054's November
 * 2026 amendment). Intl's names, but in Chinese, which names a name's or a
 * text's language from WRITTEN_IN_CHINESE. Its own name there ran English
 * into Chinese and 简体中文 into French; a heading or a choice of language
 * keeps LANGUAGE_NAMES. The server names it the same way in a refusal
 * (`languageWord` in server/src/i18n/translate.ts), so the refusal and the
 * item's page it sends a person to say it alike, as
 * e2e/document-refusals.spec.ts holds in a browser. `reader` is
 * `intl.locale`, read as the language the app is in.
 */
export function languageWord(language: Locale, reader: string): string {
  const app = matchLocale(reader) ?? DEFAULT_LOCALE;
  if (app === 'zh-Hans') return WRITTEN_IN_CHINESE[language];
  return (
    new Intl.DisplayNames([app], { type: 'language' }).of(
      new Intl.Locale(language).language,
    ) ?? language
  );
}

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
