import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import { useId } from 'react';
import { useIntl } from 'react-intl';

import type { Member } from '../api/types.gen';
import { isOwnerRole } from './role-names';

/**
 * Change roles or Remove, for a member the reader may not change
 * (ADR-080): their roles must together hold everything the member's do.
 * Said before anything is sent, with who can: an Owner, who holds
 * everything. An Owner keeps ADR-016's words.
 */
export function CannotChangeDialog({
  open,
  member,
  action,
  onClose,
}: {
  open: boolean;
  member: Member;
  /** Which of the row's actions was asked for. */
  action: 'change' | 'remove';
  onClose: () => void;
}) {
  const intl = useIntl();
  const titleId = useId();
  const name = member.name || member.email;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId}>
        {action === 'remove'
          ? intl.formatMessage(
              {
                id: 'members.cannot.removeTitle',
                defaultMessage: 'You can’t remove {name}',
              },
              { name },
            )
          : intl.formatMessage(
              {
                id: 'members.cannot.changeTitle',
                defaultMessage: 'You can’t change {name}’s roles',
              },
              { name },
            )}
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" role="note">
          {member.roles.some(isOwnerRole)
            ? intl.formatMessage(
                {
                  id: 'members.cannot.owner',
                  defaultMessage:
                    '{name} is an Owner. Only an Owner can change or remove an Owner.',
                },
                { name },
              )
            : intl.formatMessage(
                {
                  id: 'members.cannot.beyond',
                  defaultMessage:
                    'Your roles don’t include everything {name}’s roles can do, so you can’t change their roles or remove them. An Owner can.',
                },
                { name },
              )}
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          {intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
