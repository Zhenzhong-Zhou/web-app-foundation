/** The family for English and French, and every Latin letter (ADR-071). */
export const LATIN = 'NotoSans';
/**
 * The family for Simplified Chinese. Its Latin is the basic alphabet only:
 * it has no Ł, no ő, none of the letters further afield.
 */
export const CHINESE = 'NotoSansSC';

/**
 * Characters Noto Sans lacks and Noto Sans SC has: the CJK scripts, their
 * punctuation, and full-width forms such as （ and ：.
 */
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/u;

/** A piece of a line, in the one family that has all its characters. */
export interface Piece {
  text: string;
  font: string;
}

/**
 * A line cut where its script changes: Chinese in Noto Sans SC, the rest
 * in Noto Sans. pdfmake draws each piece of text in one font, with no
 * fallback for a character it lacks, so a line drawn whole in Noto Sans SC
 * would print "维生素 Łódź" with an empty box for the Ł. A space stays
 * with the piece before it, so a line is cut no more often than it must.
 */
export function piecesOf(text: string): Piece[] {
  const pieces: Piece[] = [];
  for (const character of text) {
    const last = pieces.at(-1);
    const font = CJK.test(character)
      ? CHINESE
      : last && /\s/u.test(character)
        ? last.font
        : LATIN;
    if (last?.font === font) last.text += character;
    else pieces.push({ text: character, font });
  }
  return pieces;
}

/**
 * One family for a whole run, where pdfmake takes only one: a watermark.
 * Noto Sans SC when it holds any Chinese, which then must keep to the
 * basic Latin alphabet beside it, as the words the app prints do.
 */
export function fontFor(text: string): string {
  return CJK.test(text) ? CHINESE : LATIN;
}
