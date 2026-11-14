import type { IntlShape } from 'react-intl';

type ListOptions = Parameters<IntlShape['formatListToParts']>[1];

/**
 * Names as the reader's language lists them, each drawn by `each`, a link
 * or a code: "Mei Lin or David Park", « Mei Lin ou David Park ». The names
 * go to the join as text, which an element would hide from it, so in
 * Chinese a Latin name keeps its space from 和 or 或 (makeIntl; ADR-090,
 * #501).
 */
export function listNameParts<T>(
  intl: IntlShape,
  names: readonly string[],
  options: ListOptions,
  each: (name: string, index: number) => T,
): (string | T)[] {
  // Intl.ListFormat keeps the names in their order.
  let next = 0;
  return intl.formatListToParts(names, options).map((part) => {
    if (part.type !== 'element') return part.value;
    const index = next++;
    return each(names[index], index);
  });
}
