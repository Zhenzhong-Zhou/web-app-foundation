import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { create, type Font } from 'fontkit';

/** The family for English and French, and every Latin letter (ADR-071). */
export const LATIN = 'NotoSans';
/**
 * The family for Simplified Chinese. It has the basic Latin alphabet, and
 * signs such as ≥, but not Ł, ő and the letters further afield.
 */
export const CHINESE = 'NotoSansSC';

/** Each family's files, regular and bold, as committed (ADR-071). */
export const FAMILIES = {
  [LATIN]: { normal: 'NotoSans-Regular.ttf', bold: 'NotoSans-Bold.ttf' },
  [CHINESE]: { normal: 'NotoSansSC-Regular.otf', bold: 'NotoSansSC-Bold.otf' },
} as const;

/** The committed fonts, the same three levels up from src/ and dist/. */
const DIRECTORY = resolve(__dirname, '..', '..', '..', 'assets', 'fonts');

interface Loaded {
  /** Each file's bytes, by name, for the renderer. */
  bytes: Map<string, Buffer>;
  /** Each family's regular, to ask which characters it has. */
  regular: Record<string, Font>;
}

let loaded: Loaded | undefined;

/**
 * The fonts, read from disk once, the first time anything asks: the
 * renderer for their bytes, a line for which family has its characters.
 */
export function fonts(): Loaded {
  if (!loaded) {
    const bytes = new Map<string, Buffer>();
    for (const family of Object.values(FAMILIES)) {
      for (const file of Object.values(family)) {
        bytes.set(file, readFileSync(resolve(DIRECTORY, file)));
      }
    }
    const regular = (family: keyof typeof FAMILIES) =>
      create(bytes.get(FAMILIES[family].normal) as Buffer) as Font;
    loaded = {
      bytes,
      regular: { [LATIN]: regular(LATIN), [CHINESE]: regular(CHINESE) },
    };
  }
  return loaded;
}

function has(family: string, character: string): boolean {
  return fonts().regular[family].hasGlyphForCodePoint(
    character.codePointAt(0) ?? 0,
  );
}

/** A piece of a line, in the one family that has all its characters. */
interface Piece {
  text: string;
  font: string;
}

/** Plain ASCII, which Noto Sans has whole: most lines, no look needed. */
const ASCII = /^[\x20-\x7e]*$/;

/**
 * A line cut into pieces, each in a family that has its characters, asked
 * of the fonts themselves rather than guessed from a script. pdfmake draws
 * each piece in one font, with no fallback for a character it lacks.
 *
 * A piece keeps its family while that family has the next character, so a
 * line is cut no more often than it must be: "纯度≥99%" stays whole in Noto
 * Sans SC, which has the ≥ Noto Sans lacks, and "维生素 Łódź" is cut at the
 * Ł, which only Noto Sans has. Otherwise Noto Sans first, then Noto Sans
 * SC; a character neither has prints in Noto Sans, as a box either way.
 */
export function piecesOf(text: string): Piece[] {
  if (ASCII.test(text)) return [{ text, font: LATIN }];
  const pieces: Piece[] = [];
  for (const character of text) {
    const last = pieces.at(-1);
    const font =
      last && has(last.font, character)
        ? last.font
        : has(LATIN, character) || !has(CHINESE, character)
          ? LATIN
          : CHINESE;
    if (last?.font === font) last.text += character;
    else pieces.push({ text: character, font });
  }
  return pieces;
}

/**
 * One family for a whole run, where pdfmake takes only one: a watermark.
 * Noto Sans when it has every character, else Noto Sans SC.
 */
export function fontFor(text: string): string {
  return [...text].every((character) => has(LATIN, character))
    ? LATIN
    : CHINESE;
}
