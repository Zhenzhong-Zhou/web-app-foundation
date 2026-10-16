import { Injectable, type OnModuleInit } from '@nestjs/common';
// The default import, not named ones: pdfmake exports a single instance
// whose methods use `this`, which a named import's call would lose.
import pdfmake from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

import type { PaperSize } from '../../database/schema';
import { CHINESE, FAMILIES, fonts, LATIN } from './fonts';
import { MARGIN } from './sheet';

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
 * The fonts are read once, by fonts(), and handed to pdfmake's own memory
 * when the module starts, so no PDF reads them from disk; each PDF embeds
 * only the characters it uses. pdfmake may read no file and fetch no URL a
 * document names, so a document carries only what its builder gives it, a
 * logo as bytes included.
 */
@Injectable()
export class PdfRenderer implements OnModuleInit {
  onModuleInit(): void {
    const { virtualfs } = pdfmake as unknown as { virtualfs: VirtualFiles };
    for (const [file, bytes] of fonts().bytes) {
      virtualfs.writeFileSync(file, bytes);
    }
    // No italics are designed; asked for, they fall back to upright.
    const family = ({ normal, bold }: { normal: string; bold: string }) => ({
      normal,
      bold,
      italics: normal,
      bolditalics: bold,
    });
    pdfmake.setFonts({
      [LATIN]: family(FAMILIES[LATIN]),
      [CHINESE]: family(FAMILIES[CHINESE]),
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
