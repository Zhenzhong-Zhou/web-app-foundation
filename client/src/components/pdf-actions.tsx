import { Button } from '@mui/material';
import { useIntl } from 'react-intl';

import { apiUrl } from '../lib/api';

/**
 * Print and Download PDF for a document (ADR-071): one PDF, drawn by the
 * server, which every document now is. Print opens it in a new tab, in the
 * browser's own PDF viewer, which prints it as it is on any browser;
 * Download PDF saves the same file, named by the document.
 *
 * Plain links the browser follows itself: the file never passes through
 * the page, and the session's cookie goes with them.
 */
export function PdfActions({ path }: { path: string }) {
  const intl = useIntl();

  return (
    <>
      <Button
        variant="outlined"
        href={apiUrl(path)}
        target="_blank"
        rel="noopener"
      >
        {intl.formatMessage({ id: 'invoices.print', defaultMessage: 'Print' })}
      </Button>
      <Button variant="text" href={apiUrl(`${path}?download=1`)}>
        {intl.formatMessage({
          id: 'documents.downloadPdf',
          defaultMessage: 'Download PDF',
        })}
      </Button>
    </>
  );
}
