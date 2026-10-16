import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Injectable, type OnModuleInit } from '@nestjs/common';
// The default import, not named ones: pdfmake exports a single instance
// whose methods use `this`, which a named import's call would lose.
import pdfmake from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

/** The committed fonts, the same three levels up from src/ and dist/. */
const FONTS = resolve(__dirname, '..', '..', '..', 'assets', 'fonts');

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

/** The paper an organization prints on (ADR-071). */
export type PaperSize = 'letter' | 'a4';

/** 16 mm, the margin the print pages had, in points. */
const MARGIN = (16 / 25.4) * 72;

/**
 * pdfmake's in-memory file system, which its types leave out. On the server
 * it takes a font only as a name to look up, there or on disk: bytes given
 * in place of the name are read as a URL, and fail.
 */
interface VirtualFiles {
  writeFileSync(name: string, content: Buffer): void;
}

/**
 * Draws a document as a PDF (ADR-071): the one design each document has,
 * which Print opens, Download PDF saves and the export packs.
 *
 * The fonts are read once, when the module starts, into pdfmake's own
 * memory, so no PDF reads them from disk; each PDF embeds only the
 * characters it uses. pdfmake may read no file and fetch no URL a document
 * names, so a document carries only what its builder gives it, a logo as
 * bytes included.
 */
@Injectable()
export class PdfRenderer implements OnModuleInit {
  onModuleInit(): void {
    const { virtualfs } = pdfmake as unknown as { virtualfs: VirtualFiles };
    const font = (file: string) => {
      virtualfs.writeFileSync(file, readFileSync(resolve(FONTS, file)));
      return file;
    };
    const latin = {
      normal: font('NotoSans-Regular.ttf'),
      bold: font('NotoSans-Bold.ttf'),
    };
    const chinese = {
      normal: font('NotoSansSC-Regular.otf'),
      bold: font('NotoSansSC-Bold.otf'),
    };
    // No italics are designed; asked for, they fall back to upright.
    pdfmake.setFonts({
      [LATIN]: { ...latin, italics: latin.normal, bolditalics: latin.bold },
      [CHINESE]: {
        ...chinese,
        italics: chinese.normal,
        bolditalics: chinese.bold,
      },
    });
    pdfmake.setUrlAccessPolicy(() => false);
    pdfmake.setLocalAccessPolicy(() => false);
  }

  /**
   * The document as a PDF, on the organization's paper, with the margins,
   * font and size every document starts from; the definition may change
   * any of them but the paper.
   */
  render(definition: TDocumentDefinitions, paper: PaperSize): Promise<Buffer> {
    return pdfmake
      .createPdf({
        pageMargins: MARGIN,
        defaultStyle: { font: LATIN, fontSize: 9.5, lineHeight: 1.25 },
        ...definition,
        pageSize: paper === 'letter' ? 'LETTER' : 'A4',
      })
      .getBuffer();
  }
}
