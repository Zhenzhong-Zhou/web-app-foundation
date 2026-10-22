import {
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useId } from 'react';
import { useIntl } from 'react-intl';

import type { Member } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';

/**
 * Remove from the organization (#147, ADR-080), asked first: what stays
 * theirs and what ends, since the membership goes and only a new
 * invitation brings it back. The page opens this only for a member the
 * reader may change, never for the reader, who leaves from Account.
 */
export function RemoveMemberDialog({
  open,
  member,
  organizationName,
  onClose,
  onRemoved,
}: {
  open: boolean;
  member: Member;
  organizationName: string;
  onClose: () => void;
  /** After the member has gone: the page reads its lists again. */
  onRemoved: () => Promise<void>;
}) {
  const intl = useIntl();
  const titleId = useId();
  const name = member.name || member.email;
  const values = { name, organization: organizationName };

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      onClose();
      await onRemoved();
    },
    {
      success: intl.formatMessage(
        {
          id: 'members.remove.done',
          defaultMessage: '{name} removed from {organization}',
        },
        values,
      ),
    },
  );

  function close() {
    reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      maxWidth="xs"
      fullWidth
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId}>
        {intl.formatMessage(
          {
            id: 'members.remove.title',
            defaultMessage: 'Remove {name} from {organization}?',
          },
          values,
        )}
      </DialogTitle>
      <DialogContent>
        {error && <FormError message={error} />}
        <DialogContentText sx={{ mt: error ? 2 : 0 }}>
          {intl.formatMessage(
            {
              id: 'members.remove.body',
              defaultMessage:
                '{name}’s account stays theirs, and their work here keeps their name. They lose access here on their next click. To come back, they need a new invitation.',
            },
            values,
          )}
        </DialogContentText>
      </DialogContent>
      <DialogFooter
        submitting={submitting}
        onCancel={close}
        destructive
        label={intl.formatMessage({
          id: 'members.remove.action',
          defaultMessage: 'Remove',
        })}
        pendingLabel={intl.formatMessage({
          id: 'members.remove.pending',
          defaultMessage: 'Removing…',
        })}
        onConfirm={() =>
          void submit(() => api(`/users/${member.id}`, { method: 'DELETE' }))
        }
      />
    </Dialog>
  );
}
