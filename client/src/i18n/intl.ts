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
/**
 * Kept in Vite's hot data as well as here. In development, a catalogue or a
 * module this one imports changing makes Vite run this file again, and a
 * plain module value would start over in English while React still showed
 * the chosen language: status chips and dates in English among Chinese
 * labels until a reload. Production has no hot reload: import.meta.hot is
 * undefined there. Vitest defines it but without data, hence ?. twice.
 */
let current: IntlShape =
  (import.meta.hot?.data?.intl as IntlShape | undefined) ??
  makeIntl('en', ENGLISH);

export function setIntl(next: IntlShape): void {
  current = next;
  if (import.meta.hot?.data) import.meta.hot.data.intl = next;
}

export function intl(): IntlShape {
  return current;
}
