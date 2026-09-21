import { Button } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';

/**
 * "What happened to this one", from the record itself.
 *
 * The audit page reads its filters from the URL for exactly this reason, so
 * the link is only a link: no state to pass and nothing to keep in sync
 * (ADR-018). The filter was there before anything pointed at it, and nobody
 * types a UUID into a query string.
 *
 * Hidden without audit.view rather than disabled. A disabled control asks
 * "why can't I", which is a question for an admin, and the audit page would
 * refuse the request anyway.
 *
 * A text button, like the Edit and Duplicate beside it. It sits first in the
 * row, furthest from the status chip, because it is the one action that
 * changes nothing.
 */
export function HistoryLink({ resourceId }: { resourceId: string }) {
  const { session } = useAuth();

  if (!session?.permissions.includes('audit.view')) return null;

  return (
    <Button
      variant="text"
      component={RouterLink}
      to={`/audit?${new URLSearchParams({ resourceId }).toString()}`}
    >
      History
    </Button>
  );
}
