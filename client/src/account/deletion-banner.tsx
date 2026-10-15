import { Alert, Box, Button } from '@mui/material';
import { useIntl } from 'react-intl';

import { useAuth } from '../auth/use-auth';
import { api } from '../lib/api';
import { formatDay } from '../lib/format';
import { useSubmit } from '../lib/use-submit';

/**
 * On every page while a deletion is pending (ADR-069): the day after which
 * the account goes, as the email names it, and the way to keep it. A
 * deletion nobody can see coming is one nobody can stop, and a keep that
 * failed says so rather than leaving the banner to look unchanged.
 */
export function DeletionBanner() {
  const intl = useIntl();
  const { session, refresh } = useAuth();
  const { submitting, error, submit } = useSubmit(refresh);

  const due = session?.user.deletionScheduledAt;
  if (!due) return null;
  // Deleted with the organization, as its only member: the organization's
  // banner says both, and keeps both (ADR-070).
  if (session.organization?.deletionWithAccount) return null;

  return (
    <Alert
      severity="warning"
      // Screen only, as the unverified banner: not part of a printout.
      className="no-print"
      action={
        <Button
          variant="text"
          size="small"
          disabled={submitting}
          onClick={() =>
            void submit(() => api('/account/deletion', { method: 'DELETE' }))
          }
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
