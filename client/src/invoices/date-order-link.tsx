import { Link } from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { hasCode } from '../lib/api';

/**
 * The way out of an invoice or credit note refused for its date order
 * (ADR-073), keyed on the refusal's code: the switch that keeps them in
 * date order is on Organization → Documents, for whoever may change it.
 * Shared by the Issue, Void and Credit dialogs.
 */
export function DateOrderLink({ errorCode }: { errorCode: string | null }) {
  const intl = useIntl();
  const can = useCan();

  if (
    !hasCode(errorCode, 'numbering_date_order') ||
    !can('organizations.update')
  ) {
    return null;
  }

  return (
    <Link
      component={RouterLink}
      to="/settings/organization?tab=documents"
      color="inherit"
      underline="always"
    >
      {intl.formatMessage({
        id: 'invoices.dateOrder.change',
        defaultMessage: 'Change it on Organization → Documents',
      })}
    </Link>
  );
}
