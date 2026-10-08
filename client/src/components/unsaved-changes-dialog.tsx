import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useIntl } from 'react-intl';
import type { Blocker } from 'react-router-dom';

/**
 * "Leave without saving?" for a navigation useUnsavedChanges held (issue
 * #54). Stay is the default, the safe choice; Leave lets it through and the
 * changes go. `message` says what would be lost, in the page's words.
 */
export function UnsavedChangesDialog({
  blocker,
  message,
}: {
  blocker: Blocker;
  message: string;
}) {
  const intl = useIntl();
  const open = blocker.state === 'blocked';

  return (
    <Dialog open={open} onClose={() => blocker.reset?.()}>
      <DialogTitle>
        {intl.formatMessage({
          id: 'unsaved.title',
          defaultMessage: 'Leave without saving?',
        })}
      </DialogTitle>
      <DialogContent>
        <DialogContentText>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button color="error" onClick={() => blocker.proceed?.()}>
          {intl.formatMessage({
            id: 'unsaved.leave',
            defaultMessage: 'Leave',
          })}
        </Button>
        <Button variant="contained" autoFocus onClick={() => blocker.reset?.()}>
          {intl.formatMessage({
            id: 'unsaved.stay',
            defaultMessage: 'Stay',
          })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
