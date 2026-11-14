import {
  createLiteralElement,
  isLiteralElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  type MessageFormatElement,
} from '@formatjs/icu-messageformat-parser';

import type { Messages } from './catalogues';

/**
 * The pseudo-language, en-XA (ADR-054's November 2026 amendment, R9):
 * English with accents, about 40 % longer and bracketed at each end, made
 * from the English catalogue as it is read, so it never needs updating. A
 * word still in plain English is one the catalogue does not hold, and a
 * box that cuts it is too narrow for a longer language. Placeholders,
 * plurals and tags are kept as they are, so every message formats as its
 * English does. In development and the browser tests only
 * (catalogues.ts); the server's messages stay plain English in it.
 */

/**
 * Each letter with a mark it can carry, from the Latin letters every font
 * the app uses has; b, f, m, p, q, v and x have none there and stay.
 * Capitals with a mark stand taller, so a box that cuts the top of a line
 * shows it too.
 */
const ACCENTED: Record<string, string> = {
  a: 'á',
  c: 'ç',
  d: 'ď',
  e: 'é',
  g: 'ğ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ĺ',
  n: 'ñ',
  o: 'ó',
  r: 'ŕ',
  s: 'š',
  t: 'ť',
  u: 'ú',
  w: 'ŵ',
  y: 'ý',
  z: 'ž',
  A: 'Á',
  C: 'Ç',
  D: 'Ď',
  E: 'É',
  G: 'Ğ',
  H: 'Ĥ',
  I: 'Í',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ĺ',
  N: 'Ñ',
  O: 'Ó',
  R: 'Ŕ',
  S: 'Š',
  T: 'Ť',
  U: 'Ú',
  W: 'Ŵ',
  Y: 'Ý',
  Z: 'Ž',
};

/**
 * What lengthens a message, as Chrome's own en-XA does: words, so a longer
 * line still wraps where English would, rather than one long word that
 * no box could hold.
 */
const PADDING = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];

/** How much longer than its English a message reads: about 40 %. */
const LONGER = 0.4;

function accented(text: string): string {
  return text.replace(/[a-zA-Z]/g, (letter) => ACCENTED[letter] ?? letter);
}

/** Each piece of text accented, everything else kept as it is. */
function accent(elements: MessageFormatElement[]): MessageFormatElement[] {
  return elements.map((element) => {
    if (isLiteralElement(element)) {
      return { ...element, value: accented(element.value) };
    }
    if (isTagElement(element)) {
      return { ...element, children: accent(element.children) };
    }
    if (isPluralElement(element) || isSelectElement(element)) {
      return {
        ...element,
        options: Object.fromEntries(
          Object.entries(element.options).map(([key, option]) => [
            key,
            { ...option, value: accent(option.value) },
          ]),
        ),
      };
    }
    return element;
  });
}

/**
 * The letters a message shows, its longest branch where it has several;
 * a placeholder's value is not known here, and counts for nothing.
 */
function length(elements: MessageFormatElement[]): number {
  return elements.reduce((sum, element) => {
    if (isLiteralElement(element)) return sum + element.value.length;
    if (isTagElement(element)) return sum + length(element.children);
    if (isPluralElement(element) || isSelectElement(element)) {
      return (
        sum +
        Math.max(
          ...Object.values(element.options).map(({ value }) => length(value)),
        )
      );
    }
    return sum;
  }, 0);
}

/** Words that add about 40 % to a message of `letters`, a space first. */
function padding(letters: number): string {
  const wanted = Math.ceil(letters * LONGER);
  let added = '';
  for (let at = 0; added.length < wanted; at += 1) {
    added += ` ${PADDING[at % PADDING.length]}`;
  }
  return added;
}

/** One message in the pseudo-language; an empty one stays empty. */
export function pseudoMessage(
  english: MessageFormatElement[],
): MessageFormatElement[] {
  if (english.length === 0) return english;
  return [
    createLiteralElement('['),
    ...accent(english),
    createLiteralElement(`${padding(length(english))}]`),
  ];
}

/** The whole catalogue in the pseudo-language, made from the English. */
export function pseudoMessages(english: Messages): Messages {
  return Object.fromEntries(
    Object.entries(english).map(([id, message]) => [
      id,
      pseudoMessage(message),
    ]),
  );
}
