import DownloadIcon from '@mui/icons-material/Download';
import { Alert, Button, Snackbar } from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { ApiError, download } from '../lib/api';

/**
 * Export (ADR-057): the list as a CSV file, with whatever filters, range,
 * search and sort the page has on now; the server writes it, so the file
 * holds every matching row, not the page on screen. A refusal (too many
 * rows) is shown as the server words it.
 */
export function ExportButton({ path }: { path: string }) {
  const intl = useIntl();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await download(path);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : intl.formatMessage({
              id: 'export.failed',
              defaultMessage: 'The export could not be made. Try again.',
            }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<DownloadIcon />}
        onClick={() => void run()}
        disabled={busy}
      >
        {intl.formatMessage({ id: 'export.button', defaultMessage: 'Export' })}
      </Button>
      <Snackbar
        open={error !== null}
        autoHideDuration={8000}
        onClose={() => setError(null)}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
