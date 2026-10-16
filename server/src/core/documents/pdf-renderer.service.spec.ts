import { describe, expect, it } from 'vitest';

import { fontFor } from './fonts';
import { PdfRenderer } from './pdf-renderer.service';

describe('PdfRenderer', () => {
  const renderer = new PdfRenderer();
  renderer.onModuleInit();

  it('draws a PDF, embedding the fonts its runs used', async () => {
    const pdf = await renderer.render(
      {
        content: [
          { text: 'Facture / Invoice', font: fontFor('Facture / Invoice') },
          { text: '发票 / Invoice', font: fontFor('发票 / Invoice') },
        ],
      },
      'a4',
    );

    const source = pdf.toString('latin1');
    expect(source.startsWith('%PDF-')).toBe(true);
    // Each embedded as a subset: a six-letter tag, then the font's name.
    expect(source).toMatch(/\/BaseFont \/\w+\+NotoSans-Regular/);
    expect(source).toMatch(/\/BaseFont \/\w+\+NotoSansSC-Regular/);
  });

  it('draws on the organization’s paper', async () => {
    const letter = await renderer.render({ content: 'x' }, 'letter');
    const a4 = await renderer.render({ content: 'x' }, 'a4');

    expect(letter.toString('latin1')).toContain('/MediaBox [0 0 612 792]');
    expect(a4.toString('latin1')).toContain('/MediaBox [0 0 595.28 841.89]');
  });
});
