import { Alert, Button } from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { useAuth } from '../auth/use-auth';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';

/**
 * On every page while a deletion is pending (ADR-069): when the account
 * goes, and the way to keep it. A deletion nobody can see coming is one
 * nobody can stop.
 */
export function DeletionBanner() {
  const intl = useIntl();
  const { session, refresh } = useAuth();
  const [keeping, setKeeping] = useState(false);

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
            void api('/account/deletion', { method: 'DELETE' })
              .then(() => refresh())
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
            'Your account will be deleted on {date}. Until then you can keep it.',
        },
        { date: formatDate(due) },
      )}
    </Alert>
  );
}
