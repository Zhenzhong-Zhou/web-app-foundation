import { readFileSync } from 'node:fs';

import { createIntl, type IntlShape } from 'react-intl';

/** The languages a person reads, as the catalogues are named. */
export type Language = 'en' | 'fr-CA' | 'zh-Hans';

type Values = Record<string, string | number>;

/**
 * A message in a language, read by its id through one folder's
 * catalogues: what a browser test checks a screen's line or a refusal
 * against, so it checks which message was shown, and a review that
 * rewords a translation changes no test (conventions.md, Tests). Whether
 * the words are right is the catalogue checks' job; a test whose point is
 * the exact words keeps them typed.
 */
function sayer(folder: URL) {
  const intls = new Map<Language, IntlShape>();
  return (language: Language, id: string, values?: Values): string => {
    let intl = intls.get(language);
    if (!intl) {
      const messages = JSON.parse(
        readFileSync(new URL(`${language}.json`, folder), 'utf8'),
      ) as Record<string, string>;
      intl = createIntl({ locale: language, messages });
      intls.set(language, intl);
    }
    const message = intl.messages[id];
    if (typeof message !== 'string') {
      throw new Error(`No message ${id} in ${folder.pathname}${language}.json`);
    }
    return String(
      intl.formatters.getMessageFormat(message, language).format(values),
    );
  };
}

/** A screen's message, from client/src/locales. */
export const saidOn = sayer(new URL('../../src/locales/', import.meta.url));

/** The server's message, from server/src/i18n. */
export const saidBy = sayer(
  new URL('../../../server/src/i18n/', import.meta.url),
);
