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
 *
 * A record page whose read got no answer (LoadFailure) shows it too, with
 * `onRetry` reading the record again in place of the load in full, so the
 * two "Can't reach the server" pages behave alike. At start, when the
 * first session read got no answer, `standalone`, with `onRetry` reading
 * it again.
 */
export function OfflinePage({
  onRetry = reloadPage,
  standalone,
}: {
  onRetry?: () => void;
  standalone?: boolean;
}) {
  const intl = useIntl();

  useEffect(() => {
    const retry = () => onRetry();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [onRetry]);

  return (
    <StatusPage
      kind="offline"
      title={intl.formatMessage({
        id: 'status.offline.title',
        defaultMessage: 'Can’t reach the server',
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
        <Button variant="contained" onClick={() => onRetry()}>
          {intl.formatMessage({
            id: 'status.tryAgain',
            defaultMessage: 'Try again',
          })}
        </Button>
      }
      standalone={standalone}
    />
  );
}
