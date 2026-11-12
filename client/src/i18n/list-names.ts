import type { IntlShape } from 'react-intl';

type ListType = 'conjunction' | 'disjunction';

/** Chinese text, as 和 and 或 are. */
const HAN = /\p{Script=Han}/u;

/**
 * What a name may end or start with and still meet 和 or 或 with no
 * space: Chinese, the full-width punctuation that sits beside it, or a
 * space already.
 */
const NO_SPACE = /[\s\p{Script=Han}\u3000-\u303f\uff00-\uffef]/u;

type Part = { name: number } | { words: string };

/**
 * Names as the reader's language lists them, each drawn by `each`: "Mei
 * Lin or David Park", « Mei Lin ou David Park ». In Chinese, a name that
 * is not Chinese where it meets 和 or 或 keeps a space from it (ADR-090):
 * "Mei Lin 或 David Park", "李明或王芳", "李明或 David Park"; 、 takes
 * none, being full-width (#501).
 */
export function listNameParts<T>(
  intl: IntlShape,
  names: readonly string[],
  type: ListType,
  each: (name: string, index: number) => T,
): (string | T)[] {
  // Intl.ListFormat keeps the names in their order.
  let next = 0;
  const parts = intl
    .formatListToParts(names, { type })
    .map((part): Part =>
      part.type === 'element'
        ? { name: next++ }
        : { words: String(part.value) },
    );
  const spaced = new Intl.Locale(intl.locale).language === 'zh';
  const nameAt = (part: Part | undefined) =>
    part && 'name' in part ? names[part.name] : '';

  return parts.map((part, at) => {
    if ('name' in part) return each(names[part.name], part.name);
    if (!spaced) return part.words;
    const last = nameAt(parts[at - 1]).at(-1);
    const first = nameAt(parts[at + 1]).charAt(0);
    const spaceBefore =
      !!last && HAN.test(part.words.charAt(0)) && !NO_SPACE.test(last);
    const spaceAfter =
      !!first && HAN.test(part.words.at(-1) ?? '') && !NO_SPACE.test(first);
    return `${spaceBefore ? ' ' : ''}${part.words}${spaceAfter ? ' ' : ''}`;
  });
}

/** The same list as one string, for a sentence's `{names}`. */
export function listNames(
  intl: IntlShape,
  names: readonly string[],
  type: ListType,
): string {
  return listNameParts(intl, names, type, (name) => name).join('');
}
