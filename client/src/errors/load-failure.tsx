import { Alert, Button } from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { ApiError, isRevisionRefusal } from '../lib/api';
import { OfflinePage } from './offline-page';
import { RevisionRefusalPage } from './revision-refusal-page';
import { GoHome, SearchEverything } from './status-actions';
import { StatusPage } from './status-page';

/**
 * A record page whose record did not load (conventions.md, "Status
 * pages"): a 404 says the record does not exist, with its list and the
 * lookup; a 403 says the reader may not see it, in the server's words,
 * which name what their roles lack and who could give it (ADR-080, #148);
 * no answer at all says the server is out of reach, with Try again, and
 * tries again by itself when the connection comes back, as a page that
 * would not load does; a refusal for this tab's API revision says a new
 * version is ready, or being installed (ADR-081). Any other failure keeps
 * the server's own words, as before.
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

  if (isRevisionRefusal(failure)) {
    return <RevisionRefusalPage failure={failure} onRetry={onRetry} />;
  }

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
        message={failure.message}
        actions={<GoHome primary />}
      />
    );
  }

  // fetch rejects with a TypeError when no answer came back at all.
  if (failure instanceof TypeError) return <OfflinePage onRetry={onRetry} />;

  return <Alert severity="error">{message}</Alert>;
}
