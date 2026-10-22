import { Button } from '@mui/material';
import { useEffect } from 'react';
import { useIntl } from 'react-intl';

import { reloadPage } from '../version/reload-page';
import { StatusPage } from './status-page';

/**
 * A page that would not load, with the version file out of reach too: the
 * connection dropped (ADR-081). Try again loads the page in full, and so
 * does the browser saying the connection is back, which the page says, so
 * nobody has to be there to press it.
 */
export function OfflinePage() {
  const intl = useIntl();

  useEffect(() => {
    window.addEventListener('online', reloadPage);
    return () => window.removeEventListener('online', reloadPage);
  }, []);

  return (
    <StatusPage
      kind="offline"
      title={intl.formatMessage({
        id: 'status.offline.title',
        defaultMessage: "Can't reach the server",
      })}
      message={intl.formatMessage({
        id: 'status.offline.message',
        defaultMessage:
          'Your connection or the server is down for the moment. Nothing you entered is lost; try again in a minute.',
      })}
      note={intl.formatMessage({
        id: 'status.offline.triesItself',
        defaultMessage:
          'This page tries again by itself when your connection comes back.',
      })}
      actions={
        <Button variant="contained" onClick={reloadPage}>
          {intl.formatMessage({
            id: 'status.tryAgain',
            defaultMessage: 'Try again',
          })}
        </Button>
      }
    />
  );
}
