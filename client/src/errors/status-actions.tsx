import { Button } from '@mui/material';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { reloadPage } from '../version/reload-page';
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

/**
 * Loads the page in full, from the new version once one is out (ADR-081),
 * or afresh after a crash: the main action on a status page, and a text
 * button in a banner or a refusal's line, in its colour.
 */
export function Reload({ primary = false }: { primary?: boolean }) {
  const intl = useIntl();
  return (
    <Button
      variant={primary ? 'contained' : 'text'}
      color={primary ? 'primary' : 'inherit'}
      onClick={reloadPage}
    >
      {intl.formatMessage({ id: 'version.reload', defaultMessage: 'Reload' })}
    </Button>
  );
}
