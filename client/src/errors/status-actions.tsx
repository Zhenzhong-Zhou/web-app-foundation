import { Button } from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { openLookup } from './open-lookup';

/** The actions status pages share, worded once. */
export function GoHome({ primary = false }: { primary?: boolean }) {
  const intl = useIntl();
  return (
    <Button
      component={RouterLink}
      to="/"
      variant={primary ? 'contained' : 'outlined'}
    >
      {intl.formatMessage({ id: 'status.goHome', defaultMessage: 'Go home' })}
    </Button>
  );
}

export function SearchEverything() {
  const intl = useIntl();
  return (
    <Button variant="outlined" onClick={openLookup}>
      {intl.formatMessage({
        id: 'search.label',
        defaultMessage: 'Search everything',
      })}
    </Button>
  );
}
