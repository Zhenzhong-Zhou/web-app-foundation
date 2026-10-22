import RefreshIcon from '@mui/icons-material/Refresh';
import { Alert, Button } from '@mui/material';
import type { ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import { reloadPage } from './reload-page';
import { useNewVersion } from './version-check';

/**
 * A new version, said in a banner (ADR-081), with Reload and no close:
 *
 * - `signedOut`, on the pages before an account, which have no top bar and
 *   where nobody is mid-task: in the info tone once a newer build is out,
 *   amber once its saves would be refused;
 * - `page`, at the top of a signed-in page, amber only: until then the top
 *   bar says it (NewVersionButton), and moves nothing under someone's hand;
 * - `dialog`, at the very top of every dialog, above its title, amber only,
 *   since a dialog that fills a phone's screen covers the page's banner.
 *   The theme adds it to them all (VersionPaper).
 */
export function NewVersionBanner({
  where,
}: {
  where: 'signedOut' | 'page' | 'dialog';
}) {
  const intl = useIntl();
  const { newer, urgent } = useNewVersion();
  if (!urgent && !(newer && where === 'signedOut')) return null;

  return (
    <Alert
      severity={urgent ? 'warning' : 'info'}
      role="status"
      icon={urgent ? undefined : <RefreshIcon />}
      action={
        <Button variant="text" color="inherit" onClick={reloadPage}>
          {intl.formatMessage({
            id: 'version.reload',
            defaultMessage: 'Reload',
          })}
        </Button>
      }
      sx={where === 'dialog' ? { borderRadius: 0, flexShrink: 0 } : undefined}
    >
      {urgent ? (
        <FormattedMessage
          id="version.urgent"
          defaultMessage="<b>A new version is ready, and this tab can no longer save changes.</b> Copy anything you’ve typed, then reload."
          values={{
            b: (chunks: ReactNode[]) => <strong>{chunks}</strong>,
          }}
        />
      ) : (
        intl.formatMessage({
          id: 'version.signedOut',
          defaultMessage:
            'A new version is ready. It loads when you open another page.',
        })
      )}
    </Alert>
  );
}
