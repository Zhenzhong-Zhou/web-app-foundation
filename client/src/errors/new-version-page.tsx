import { Button } from '@mui/material';
import { useIntl } from 'react-intl';

import { reloadPage } from '../version/reload-page';
import { StatusPage } from './status-page';

/**
 * A page this tab's build cannot show, since a new version came out while
 * it was open (ADR-081). After a page that would not load, it shows only
 * once loading it in full from the new version has been tried, so a load
 * that fails again stops here rather than looping. After a read the API
 * refused as outdated, it shows once the file names the new version; at
 * start, before the app has drawn, `standalone`.
 */
export function NewVersionPage({ standalone }: { standalone?: boolean }) {
  const intl = useIntl();
  return (
    <StatusPage
      kind="updated"
      standalone={standalone}
      title={intl.formatMessage({
        id: 'version.ready',
        defaultMessage: 'A new version is ready',
      })}
      message={intl.formatMessage({
        id: 'version.cameOut',
        defaultMessage:
          'A new version came out while this tab was open. Reload to use it; nothing is lost.',
      })}
      actions={
        <Button variant="contained" onClick={reloadPage}>
          {intl.formatMessage({
            id: 'version.reload',
            defaultMessage: 'Reload',
          })}
        </Button>
      }
    />
  );
}
