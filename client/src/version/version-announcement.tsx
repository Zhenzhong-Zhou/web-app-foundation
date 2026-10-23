import { Box } from '@mui/material';
import { useIntl } from 'react-intl';

import { HIDDEN } from '../lib/hidden';
import { useNewVersion } from './version-check';

/**
 * A newer build's arrival, said politely to a screen reader (ADR-081):
 * that it loads by itself at the next page, or, once this tab's saves
 * would be refused, that it can no longer save, the amber banner's words.
 * Said again when it turns urgent, since that changes what to do.
 *
 * In the top bar, and in every dialog's paper (VersionPaper): an open
 * dialog hides the rest of the page from a screen reader, the top bar's
 * words included, so one that arrives meanwhile is said in the dialog.
 */
export function VersionAnnouncement() {
  const intl = useIntl();
  const { newer, urgent } = useNewVersion();

  return (
    <Box aria-live="polite" sx={HIDDEN}>
      {urgent
        ? intl.formatMessage(
            {
              id: 'version.urgent',
              defaultMessage:
                '<b>A new version is ready, and this tab can no longer save changes.</b> Copy anything you’ve typed, then reload.',
            },
            { b: (chunks) => chunks.join('') },
          )
        : newer &&
          intl.formatMessage({
            id: 'version.note',
            defaultMessage:
              'A new version is ready. It loads by itself when you open another page.',
          })}
    </Box>
  );
}
