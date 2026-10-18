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

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Text as a reader sees its characters: an emoji, or a letter typed with
 * its accent as a second code point, is one, never cut in half.
 */
function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

/** A text's letters and digits, as graphemes, without marks or emoji. */
function lettersOf(text: string): string[] {
  return graphemes(text).filter((g) => LETTER.test(g));
}

/** The first letter or digit of a word, skipping a bracket or an emoji. */
function firstLetter(word: string): string | undefined {
  return lettersOf(word)[0];
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
 * - **Any other script**: its first character, which is never wrong where
 *   the app does not know the custom.
 *
 * Without a letter in the name, the first two letters of the email.
 */
export function initialsOf(name: string | null, email?: string | null): string {
  const words = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter((word) => firstLetter(word));

  if (words.length > 0) {
    const letters = lettersOf(words.join(''));
    if (letters.every((g) => HAN.test(g))) return letters.slice(-2).join('');

    const first = firstLetter(words[0]) as string;
    if (!CASED.test(first)) return first;
    // Only the words in a cased script: Zhou 振中 gives ZH, not Z振.
    const cased = words.filter((word) =>
      CASED.test(firstLetter(word) as string),
    );
    const pair =
      cased.length > 1
        ? [first, firstLetter(cased[cased.length - 1]) as string]
        : lettersOf(cased[0]).slice(0, 2);
    return pair.map(capital).join('');
  }

  const letters = lettersOf((email ?? '').split('@')[0]).slice(0, 2);
  return letters.length > 0 ? letters.map(capital).join('') : '?';
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
