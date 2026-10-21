import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
} from '@mui/material';
import { useId } from 'react';
import { useIntl } from 'react-intl';

import type { RoleDetail } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api, hasCode } from '../lib/api';
import { useSubmit } from '../lib/use-submit';

/**
 * Deleting a made role (ADR-080), only once nobody holds it: while
 * someone does, the dialog says who and offers Move everyone to… instead
 * of Delete. A live invitation naming it is the server's to find, and its
 * refusal says what to do; one held since the page was read comes back as
 * `role_held`, with Move everyone offered the same way.
 */
export function DeleteRoleDialog({
  open,
  role,
  onClose,
  onMoveEveryone,
  onDeleted,
}: {
  open: boolean;
  role: RoleDetail;
  onClose: () => void;
  /** Absent for a reader who may not change members' roles. */
  onMoveEveryone?: () => void;
  onDeleted: () => void;
}) {
  const intl = useIntl();
  const id = useId();

  const { submitting, error, errorCode, reset, submit } = useSubmit(
    () => onDeleted(),
    {
      success: intl.formatMessage(
        { id: 'roles.delete.done', defaultMessage: '{role} deleted' },
        { role: role.name },
      ),
    },
  );

  function close() {
    reset();
    onClose();
  }

  const held = role.holderCount > 0 || hasCode(errorCode, 'role_held');
  const title = intl.formatMessage(
    { id: 'roles.delete.title', defaultMessage: 'Delete {role}?' },
    { role: role.name },
  );
  const closeLabel = intl.formatMessage({
    id: 'common.close',
    defaultMessage: 'Close',
  });
  const moveLabel = intl.formatMessage({
    id: 'roles.move',
    defaultMessage: 'Move everyone to…',
  });

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      maxWidth="xs"
      fullWidth
      aria-labelledby={`${id}-title`}
    >
      <DialogTitle id={`${id}-title`}>{title}</DialogTitle>
      <DialogContent>
        {held ? (
          <Alert severity="warning" role="note">
            {role.holderCount > 0
              ? intl.formatMessage(
                  {
                    id: 'roles.delete.held',
                    defaultMessage:
                      '{count, plural, one {{names} holds {role}} other {# members hold {role}: {names}}}. Move them to another role first.',
                  },
                  {
                    count: role.holderCount,
                    names: intl.formatList(
                      role.holders.map((holder) => holder.name),
                    ),
                    role: role.name,
                  },
                )
              : error}
          </Alert>
        ) : (
          <Stack spacing={2}>
            {error && <FormError message={error} />}
            <DialogContentText>
              {intl.formatMessage({
                id: 'roles.delete.body',
                defaultMessage:
                  'Nobody holds it. An invitation that ended or was revoked stops naming it, and the audit log keeps what it granted.',
              })}
            </DialogContentText>
          </Stack>
        )}
      </DialogContent>
      {held ? (
        <DialogActions>
          <Button variant="text" onClick={close}>
            {closeLabel}
          </Button>
          {onMoveEveryone && (
            <Button
              onClick={() => {
                reset();
                onMoveEveryone();
              }}
            >
              {moveLabel}
            </Button>
          )}
        </DialogActions>
      ) : (
        <DialogFooter
          submitting={submitting}
          onCancel={close}
          destructive
          label={intl.formatMessage({
            id: 'roles.delete.confirm',
            defaultMessage: 'Delete role',
          })}
          pendingLabel={intl.formatMessage({
            id: 'roles.delete.deleting',
            defaultMessage: 'Deleting…',
          })}
          onConfirm={() =>
            void submit(() => api(`/roles/${role.id}`, { method: 'DELETE' }))
          }
        />
      )}
    </Dialog>
  );
}
