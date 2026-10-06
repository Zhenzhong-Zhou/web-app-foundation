import { IntlMessageFormat } from 'intl-messageformat';

import {
  DEFAULT_LOCALE,
  type Locale,
  SUPPORTED_LOCALES,
} from '../common/locales';
import english from './en.json';
import french from './fr-CA.json';
import chinese from './zh-Hans.json';

/**
 * The server's words in the language a person reads (ADR-054).
 *
 * A service throws a message id with its values and its English beside it:
 *
 *     throw new ConflictException(
 *       t({ id: 'auth.invalidCredentials', defaultMessage: 'Invalid email or password' }),
 *     );
 *
 * Formatted with intl-messageformat, the ICU engine under the client's
 * react-intl, so plurals and placeholders behave the same on both sides;
 * its version 10 is the one that still loads as CommonJS, as the server
 * and its Jest run.
 *
 * `t` writes the English at once, so a log line, a request with no language
 * (curl, an integration, the e2e suite) and anything that reads the
 * exception's message see exactly the sentence they always did. It also
 * keeps the id and the values, which AllExceptionsFilter renders in the
 * request's language on the way out. A service never knows the request.
 *
 * The English lives beside the rule, as on the client: `npm run
 * i18n:extract` collects every `t()` into `src/i18n/en.json`, and the same
 * `i18n:check` as the client's holds the French and Chinese to it.
 */

/**
 * A value a message can carry: data; a list of data, joined the way the
 * language joins a list ("CAD and USD", "CAD et USD", "CAD和USD"); or a
 * whole message of its own, rendered in the same language as the sentence
 * around it.
 */
export type MessageValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly string[]
  | Translatable;

/**
 * What a translatable exception carries as its response body. `message` is
 * the English, so anything that reads an exception the usual way still
 * finds a sentence; the id and values are for the filter.
 */
export interface Translatable {
  message: string;
  messageId: string;
  values?: Record<string, MessageValue>;
}

const CATALOGUES: Record<Locale, Record<string, string>> = {
  en: english,
  'fr-CA': french,
  'zh-Hans': chinese,
};

/** Parsed once per language and message, then reused. */
const formatters = new Map<string, IntlMessageFormat>();

function render(
  source: string,
  values: Record<string, MessageValue> | undefined,
  locale: Locale,
): string {
  const key = `${locale}\u0000${source}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new IntlMessageFormat(source, locale);
    formatters.set(key, formatter);
  }
  // A nested message in the same language as the sentence it sits in.
  const flat = Object.fromEntries(
    Object.entries(values ?? {}).map(([key, value]) => [
      key,
      isTranslatable(value)
        ? locale === DEFAULT_LOCALE
          ? value.message
          : translate(value, locale)
        : Array.isArray(value)
          ? new Intl.ListFormat(locale, { type: 'conjunction' }).format(
              value as string[],
            )
          : value,
    ]),
  );
  return String(formatter.format(flat));
}

/**
 * A message, its English written now and its id kept for the filter. The
 * English is the defaultMessage beside the rule, as `i18n:extract` reads it
 * into en.json; the two are always the same text.
 */
export function t(
  descriptor: { id: string; defaultMessage: string },
  values?: Record<string, MessageValue>,
): Translatable {
  return {
    message: render(descriptor.defaultMessage, values, DEFAULT_LOCALE),
    messageId: descriptor.id,
    ...(values ? { values } : {}),
  };
}

/**
 * A thrown message in the request's language. English is the sentence
 * written when it was thrown, word for word; another language is rendered
 * from its catalogue, or left English when the catalogue lacks the id.
 */
export function translate(message: Translatable, locale: Locale): string {
  const source = CATALOGUES[locale][message.messageId];
  if (locale === DEFAULT_LOCALE || source === undefined) return message.message;
  return render(source, message.values, locale);
}

/** Whether an exception's response body carries a message id. */
export function isTranslatable(value: unknown): value is Translatable {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Translatable).messageId === 'string' &&
    typeof (value as Translatable).message === 'string'
  );
}

/**
 * The language a request asks for, from its Accept-Language header: the
 * first supported one in the order of preference given, matched exactly or
 * by language (fr-FR asks for fr-CA, zh-CN and zh for zh-Hans, en-GB for
 * en). No header, or nothing supported, is English.
 */
export function localeOf(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const wanted = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((param) => param.trim())
        .find((param) => param.startsWith('q='));
      return {
        tag: tag.trim().toLowerCase(),
        weight: q ? Number(q.slice(2)) : 1,
        index,
      };
    })
    .filter(({ tag, weight }) => tag && tag !== '*' && weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);

  for (const { tag } of wanted) {
    const exact = SUPPORTED_LOCALES.find(
      (locale) => locale.toLowerCase() === tag,
    );
    if (exact) return exact;

    const language = tag.split('-')[0];
    const byLanguage = SUPPORTED_LOCALES.find(
      (locale) => locale.split('-')[0].toLowerCase() === language,
    );
    // Chinese written in Traditional characters is not zh-Hans.
    if (byLanguage === 'zh-Hans' && /-(hant|tw|hk|mo)\b/.test(tag)) continue;
    if (byLanguage) return byLanguage;
  }

  return DEFAULT_LOCALE;
}

/**
 * The language to write to someone in where no browser is asking (ADR-054):
 * an email, a notification. Their own choice, else the language of the
 * request that caused it, else English.
 */
export function recipientLocale(
  chosen: string | null | undefined,
  acceptLanguage?: string,
): Locale {
  const own = SUPPORTED_LOCALES.find((locale) => locale === chosen);
  return own ?? localeOf(acceptLanguage);
}
