import { Alert, Box, Button } from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { useAuth } from '../auth/use-auth';
import { api, messageFor } from '../lib/api';
import { formatDay } from '../lib/format';

/**
 * On every page while a deletion is pending (ADR-069): the day after which
 * the account goes, as the email names it, and the way to keep it. A
 * deletion nobody can see coming is one nobody can stop, and a keep that
 * failed says so rather than leaving the banner to look unchanged.
 */
export function DeletionBanner() {
  const intl = useIntl();
  const { session, refresh } = useAuth();
  const [keeping, setKeeping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const due = session?.user.deletionScheduledAt;
  if (!due) return null;

  return (
    <Alert
      severity="warning"
      // Screen only, as the unverified banner: not part of a printout.
      className="no-print"
      action={
        <Button
          variant="text"
          size="small"
          disabled={keeping}
          onClick={() => {
            setKeeping(true);
            setError(null);
            void api('/account/deletion', { method: 'DELETE' })
              .then(() => refresh())
              .catch((caught: unknown) => setError(messageFor(caught)))
              .finally(() => setKeeping(false));
          }}
        >
          {intl.formatMessage({
            id: 'account.deletion.keep',
            defaultMessage: 'Keep my account',
          })}
        </Button>
      }
    >
      {intl.formatMessage(
        {
          id: 'account.deletion.banner',
          defaultMessage:
            'Your account will be deleted after {date}. Until then you can keep it.',
        },
        { date: formatDay(due) },
      )}
      {error && <Box sx={{ mt: 1 }}>{error}</Box>}
    </Alert>
  );
}
