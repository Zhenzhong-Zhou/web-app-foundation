import type {
  Content,
  ContentColumns,
  ContentImage,
  TDocumentDefinitions,
} from 'pdfmake/interfaces';
import { describe, expect, it } from 'vitest';

import { DocumentsService, type Printable } from './documents.service';
import { run } from './sheet';

/**
 * What every document gets from DocumentsService.pdf, beside its own
 * drawing (ADR-071, amended): the logo above it and every page's foot.
 * The renderer is replaced, so the definition is read before it is drawn.
 */
describe('DocumentsService.pdf', () => {
  async function definitionOf(logo: string | null) {
    let definition: TDocumentDefinitions | undefined;
    const renderer = {
      render: (drawn: TDocumentDefinitions) => {
        definition = drawn;
        return Promise.resolve(Buffer.alloc(0));
      },
    };
    const service = new DocumentsService(
      null as never,
      null as never,
      renderer as never,
    );
    const printable: Printable = {
      language: 'en',
      secondLanguage: null,
      sellerCountry: 'CA',
      name: () => 'INV-000042.pdf',
      which: () => 'Invoice · INV-000042',
      draw: () => ({ content: [run('The lines')] }),
    };
    await service.pdf(printable, {
      logo,
      country: 'CA',
      paper: null,
      timeZone: 'UTC',
    });
    return definition as TDocumentDefinitions & { content: Content[] };
  }

  it('says on every page what it is and which page of how many', async () => {
    const { footer } = await definitionOf(null);
    const foot = (footer as (page: number, count: number) => ContentColumns)(
      1,
      2,
    );

    expect(
      foot.columns.map((column) => (column as { text: string }).text),
    ).toEqual(['Invoice · INV-000042', 'Page 1 of 2']);
  });

  it('puts the logo above the drawing, and nothing there without one', async () => {
    const logo = 'data:image/png;base64,AA';

    const shown = await definitionOf(logo);
    expect((shown.content[0] as ContentImage).image).toBe(logo);
    expect(shown.content[1]).toMatchObject({ text: 'The lines' });

    const without = await definitionOf(null);
    expect(without.content).toHaveLength(1);
    expect(without.content[0]).toMatchObject({ text: 'The lines' });
  });
});
