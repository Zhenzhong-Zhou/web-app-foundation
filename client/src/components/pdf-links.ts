import { useLanguage } from '../i18n/use-language';
import { apiUrl, withQuery } from '../lib/api';

/** A document's PDF, as plain links the browser follows itself (ADR-071). */
export interface PdfLinks {
  /** Opens the PDF, in a new tab, to print. */
  print: string;
  /** Saves the same file, named by the document. */
  download: string;
}

/**
 * The links to a document's PDF, each saying the language the app shows
 * (ADR-071, amended for #526): a refused PDF answers its link with a page
 * in that language. A plain link cannot send the app's Accept-Language,
 * and the browser's may be another, as the export's link finds too.
 *
 * The app's language itself, not intl's tag, which carries the browser's
 * region (en-US), where the server matches its own three. A function the
 * hook returns, so a list calls it for each of its rows.
 */
export function usePdfLinks(): (path: string) => PdfLinks {
  const { locale } = useLanguage();

  // A path may ask its own question already: the pro forma's tax code.
  return (path) => ({
    print: apiUrl(withQuery(path, { locale })),
    download: apiUrl(withQuery(path, { download: '1', locale })),
  });
}
