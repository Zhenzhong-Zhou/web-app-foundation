import type { TDocumentDefinitions } from 'pdfmake/interfaces';

/**
 * Every word a document's drawing holds, joined by spaces: what a PDF says,
 * read from the definition the builder returns rather than from the file,
 * whose text pdfmake compresses (ADR-071). The client's print pages were
 * read on screen by its e2e; their checks moved here when the pages went.
 *
 * Walks every string under the definition, so a font's name or an
 * alignment is in it too: assert on the words a reader would see.
 */
export function wordsOf(definition: TDocumentDefinitions): string {
  const words: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      words.push(node);
    } else if (Array.isArray(node)) {
      node.forEach(walk);
    } else if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        // A logo is a data URL, not words.
        if (key !== 'image') walk(value);
      }
    }
  };
  walk(definition);
  return words.join(' ');
}
