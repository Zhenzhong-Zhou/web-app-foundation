import { Alert, Button } from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { ApiError } from '../lib/api';
import { GoHome, SearchEverything } from './status-actions';
import { StatusPage } from './status-page';

/**
 * A record page whose record did not load (conventions.md, "Status
 * pages"): a 404 says the record does not exist, with its list and the
 * lookup; a 403 says the role does not reach it, and who can change that;
 * no answer at all says the server is out of reach, with Try again. Any
 * other failure keeps the server's own words, as before.
 */
export function LoadFailure({
  failure,
  message,
  missingTitle,
  list,
  onRetry,
}: {
  failure: unknown;
  message: string;
  /** "This order doesn't exist", in the page's words. */
  missingTitle: string;
  list: { to: string; label: string };
  onRetry?: () => void;
}) {
  const intl = useIntl();
  const { session } = useAuth();

  if (failure instanceof ApiError && failure.status === 404) {
    return (
      <StatusPage
        kind="missing"
        title={missingTitle}
        message={intl.formatMessage({
          id: 'status.missing.message',
          defaultMessage: 'It may have been removed, or the link may be wrong.',
        })}
        actions={
          <>
            <Button component={RouterLink} to={list.to} variant="contained">
              {intl.formatMessage(
                { id: 'status.goToList', defaultMessage: 'Go to {list}' },
                { list: list.label },
              )}
            </Button>
            <SearchEverything />
          </>
        }
      />
    );
  }

  if (failure instanceof ApiError && failure.status === 403) {
    return (
      <StatusPage
        kind="forbidden"
        title={intl.formatMessage({
          id: 'status.forbidden.title',
          defaultMessage: "You don't have access to this",
        })}
        message={intl.formatMessage(
          {
            id: 'status.forbidden.message',
            defaultMessage:
              'Your role does not include this. If you need it, ask an owner of {organization} to change your role.',
          },
          { organization: session?.organization?.name ?? '' },
        )}
        actions={<GoHome primary />}
      />
    );
  }

  // fetch rejects with a TypeError when no answer came back at all.
  if (failure instanceof TypeError) {
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
        actions={
          <Button
            variant="contained"
            onClick={() => (onRetry ? onRetry() : window.location.reload())}
          >
            {intl.formatMessage({
              id: 'status.tryAgain',
              defaultMessage: 'Try again',
            })}
          </Button>
        }
      />
    );
  }

  return <Alert severity="error">{message}</Alert>;
}
