/**
 * Eight colours a white initial reads on at AA in both colour modes
 * (ADR-063); a person gets the same one wherever they appear.
 */
const COLOURS = [
  '#5546B8',
  '#1F5FBF',
  '#0F6E6E',
  '#2F5D50',
  '#7A3B69',
  '#8A4B12',
  '#A1324F',
  '#3A4150',
];

/** A Chinese character, in any of its Unicode blocks. */
const HAN = /\p{Script=Han}/u;
/** The scripts with capitals, whose names shorten to initials: M. L. */
const CASED = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;
/** What counts towards initials: a letter or a digit, never a mark or emoji. */
const LETTER = /[\p{L}\p{N}]/u;

/**
 * Only where the browser has one: Firefox does from 125, below the floor
 * the build targets, and building it there would stop the app loading.
 * Made in an `if`, the only guard ESLint's compat rule recognises.
 */
let segmenter: Intl.Segmenter | undefined;
if (typeof Intl.Segmenter === 'function') {
  segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
}
/** Without a segmenter, a letter with the combining marks typed after it. */
const LETTER_WITH_MARKS = /\P{M}\p{M}*/gu;

/**
 * Text as a reader sees its characters: an emoji, or a letter typed with
 * its accent as a second code point, is one, never cut in half.
 */
function graphemes(text: string): string[] {
  return segmenter
    ? Array.from(segmenter.segment(text), (part) => part.segment)
    : (text.match(LETTER_WITH_MARKS) ?? []);
}

/** A text's letters and digits, as graphemes, without marks or emoji. */
function lettersOf(text: string): string[] {
  return graphemes(text).filter((g) => LETTER.test(g));
}

/** A capital, unless the capital is two letters (ß gives SS). */
function capital(grapheme: string): string {
  const upper = grapheme.toUpperCase();
  return graphemes(upper).length === 1 ? upper : grapheme;
}

/**
 * What a person without a photo shows (ADR-063, amended): what readers of
 * the name's own script would expect to see.
 *
 * - **Chinese**: the given name, the last two characters, which is what
 *   colleagues call each other; a name of two characters whole. 周振中
 *   gives 振中, 王芳 gives 王芳.
 * - **Latin, Greek and Cyrillic**: the first and last names' initials, or
 *   the first two letters of a single name. Mei Lin gives ML, Bob gives BO.
 *   A mixed name takes only these words, wherever they sit.
 * - **Any other script**: its first character, which is never wrong where
 *   the app does not know the custom.
 *
 * Without a letter in the name, the first two letters of the email.
 */
export function initialsOf(name: string | null, email?: string | null): string {
  // Each word as its letters; a word without one (an emoji, a bracket) goes.
  const words = (name ?? '')
    .split(/\s+/)
    .map(lettersOf)
    .filter((letters) => letters.length > 0);

  if (words.length > 0) {
    const letters = words.flat();
    if (letters.every((g) => HAN.test(g))) return letters.slice(-2).join('');

    // Only the words in a cased script, wherever they sit: Zhou 振中 gives
    // ZH, not Z振, and 张伟 David gives DA, as David alone would.
    const cased = words.filter((word) => CASED.test(word[0]));
    if (cased.length === 0) return words[0][0];
    const pair =
      cased.length > 1
        ? [cased[0][0], cased[cased.length - 1][0]]
        : cased[0].slice(0, 2);
    return pair.map(capital).join('');
  }

  const letters = lettersOf((email ?? '').split('@')[0]).slice(0, 2);
  return letters.map(capital).join('') || '?';
}

/**
 * What an organization without a logo shows (ADR-078), by a rule of its
 * own: a company's name is not a person's, and most end the same way,
 * 有限公司 or Ltd., which a person's rule would take.
 *
 * - **Starting in Chinese**: its first two Chinese characters. 海港草本有限公司
 *   gives 海港, 青禾贸易 gives 青禾.
 * - **Otherwise**: the first letters of its first two words, or one letter
 *   for a name of one word. Reid Supply Co. gives RS, Acme gives A.
 */
export function organizationInitialsOf(name: string): string {
  const words = name
    .split(/\s+/)
    .map(lettersOf)
    .filter((letters) => letters.length > 0);
  if (words.length === 0) return '?';
  if (HAN.test(words[0][0])) {
    return words
      .flat()
      .filter((g) => HAN.test(g))
      .slice(0, 2)
      .join('');
  }
  return words
    .slice(0, 2)
    .map((word) => capital(word[0]))
    .join('');
}

/**
 * The language initials are written in, for their element's `lang`:
 * Chinese characters are marked Chinese, so a screen reader reads them in
 * a Chinese voice on an English page. The rest follow the page's.
 */
export function initialsLang(initials: string): 'zh' | undefined {
  return HAN.test(initials) ? 'zh' : undefined;
}

/** The same colour for the same name, from a small stable hash. */
export function colourOf(name: string | null, email?: string | null): string {
  const text = (name || email || '').toLowerCase();
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return COLOURS[hash % COLOURS.length];
}
