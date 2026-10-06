import { createIntl, createIntlCache, type IntlShape } from 'react-intl';

import { ENGLISH, type Messages } from './catalogues';

/**
 * A message missing from every catalogue — added in code and not yet
 * extracted — shows its English and says so in development. Anything else
 * the formatter reports is a real fault and is logged as one.
 */
function reportIntlError(error: { code?: string; message: string }): void {
  if (error.code === 'MISSING_TRANSLATION') {
    if (import.meta.env.DEV) console.warn(error.message);
    return;
  }
  console.error(error);
}

/** Shared by every intl object made here, as react-intl recommends. */
const cache = createIntlCache();

export function makeIntl(tag: string, messages: Messages): IntlShape {
  return createIntl(
    { locale: tag, defaultLocale: 'en', messages, onError: reportIntlError },
    cache,
  );
}

/**
 * The intl object the screens use, for code that is not a component: what
 * a failed request says (messageFor), "just now", a refusal's wording built
 * in a helper. LanguageProvider sets it in the same step that switches the
 * screens, and hands the same object to them, so a helper and a component
 * never disagree about the language. English until then, which is also
 * what a unit test calling a helper directly gets.
 */
let current: IntlShape = makeIntl('en', ENGLISH);

export function setIntl(next: IntlShape): void {
  current = next;
}

export function intl(): IntlShape {
  return current;
}
