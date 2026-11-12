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

/** Chinese text, as 和 and 或 are. */
const HAN = /\p{Script=Han}/u;

/**
 * What a name may end or start with and still meet 和 or 或 with no
 * space: Chinese, the full-width punctuation that sits beside it, or a
 * space already.
 */
const NO_SPACE = /[\s\p{Script=Han}\u3000-\u303f\uff00-\uffef]/u;

type ListParts = ReturnType<IntlShape['formatListToParts']>;

/**
 * A Chinese list's words between two names, 和 or 或, keep a space from a
 * name that is not Chinese where they meet, once on each side (ADR-090,
 * #501): "Mei Lin 或 David Park", "李明或王芳", "李明或 David Park"; 、
 * takes none, being full-width. Only a name given as text is seen, so
 * lint keeps a list's names text and listNameParts draws them.
 */
function spaced(parts: ListParts): ListParts {
  const text = (part: ListParts[number] | undefined) =>
    part?.type === 'element' && typeof part.value === 'string'
      ? Array.from(part.value)
      : [];
  return parts.map((part, at) => {
    if (part.type !== 'literal') return part;
    const words = Array.from(part.value);
    const last = text(parts[at - 1]).at(-1);
    const first = text(parts[at + 1]).at(0);
    const before =
      !!last && HAN.test(words.at(0) ?? '') && !NO_SPACE.test(last);
    const after =
      !!first && HAN.test(words.at(-1) ?? '') && !NO_SPACE.test(first);
    return {
      ...part,
      value: `${before ? ' ' : ''}${part.value}${after ? ' ' : ''}`,
    };
  });
}

/** formatList from its parts, as react-intl joins them: text runs as one. */
function joined(parts: ListParts) {
  const all = parts.reduce<unknown[]>((made, { value }) => {
    if (typeof value === 'string' && typeof made.at(-1) === 'string') {
      made[made.length - 1] += value;
    } else made.push(value);
    return made;
  }, []);
  return all.length === 1 ? all[0] : all.length === 0 ? '' : all;
}

/**
 * The one join of a list a person reads on the screens; lint refuses any
 * other. English lists are British, as the copy is and the server's are
 * (`joinList`): "Owner, Olu Ade and Ada Byrne", with no comma before the
 * "and", in Toronto and Texas alike. Chinese lists are spaced beside a
 * Latin name (`spaced`), as the server's are too. Dates and numbers keep
 * the browser's region (formattingLocale).
 */
export function makeIntl(tag: string, messages: Messages): IntlShape {
  const config = { defaultLocale: 'en', messages, onError: reportIntlError };
  const made = createIntl({ ...config, locale: tag }, cache);
  const language = new Intl.Locale(tag).language;

  if (language === 'zh') {
    const formatListToParts: IntlShape['formatListToParts'] = (
      values,
      options,
    ) => spaced(made.formatListToParts(values, options));
    const formatList = ((...list: Parameters<typeof formatListToParts>) =>
      joined(formatListToParts(...list))) as IntlShape['formatList'];
    return { ...made, formatList, formatListToParts };
  }
  if (language !== 'en' || tag === 'en-GB') return made;

  const british = createIntl({ ...config, locale: 'en-GB' }, cache);
  return {
    ...made,
    formatList: british.formatList,
    formatListToParts: british.formatListToParts,
  };
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
