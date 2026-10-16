/** The family for English and French (ADR-071). */
export const LATIN = 'NotoSans';
/** The family for Simplified Chinese, which carries Latin too. */
export const CHINESE = 'NotoSansSC';

/**
 * Characters Noto Sans lacks and Noto Sans SC has: the CJK scripts, their
 * punctuation, and full-width forms such as （ and ：.
 */
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/u;

/**
 * The family to draw a run of text in. pdfmake draws a run in one font, with
 * no fallback for a missing character, so a run holding any Chinese is drawn
 * entirely in Noto Sans SC, whose Latin covers the rest of it.
 */
export function fontFor(text: string): string {
  return CJK.test(text) ? CHINESE : LATIN;
}
