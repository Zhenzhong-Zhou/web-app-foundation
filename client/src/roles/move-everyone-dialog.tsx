import {
  Box,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useId, useState } from 'react';
import { useIntl } from 'react-intl';

import { AccessList } from '../account/access-list';
import type { Permission, Role, RoleDetail } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { isOwnerRole } from '../members/role-names';
import { nameOf } from './role-words';

/** Past this many, the dialog counts the holders rather than naming them. */
const NAMED = 5;

/**
 * Move everyone to… (ADR-080): every member holding this role holds the
 * one chosen in its place, in one step; how a built-in role is varied
 * with a copy, and how a role is emptied before it is deleted. Only a role
 * the reader may give is offered, under the rule that only what you hold
 * can be given; the server refuses members whose roles go beyond the
 * reader's, naming them. Once a role is chosen, it says what the holders
 * gain and lose, in Your access's sentences as Change roles shows them,
 * from the two roles' permissions: a holder whose other roles give what
 * this one took keeps it.
 */
export function MoveEveryoneDialog({
  open,
  role,
  roles,
  onClose,
  onMoved,
}: {
  open: boolean;
  role: RoleDetail;
  roles: Role[];
  onClose: () => void;
  onMoved: () => Promise<void>;
}) {
  const intl = useIntl();
  const id = useId();
  const from = nameOf(role);
  const choices = roles.filter((each) => each.id !== role.id && each.mayGive);
  const [toRoleId, setToRoleId] = useState('');
  const to = choices.find((each) => each.id === toRoleId);
  const count = role.holders.length;
  const gained = to
    ? to.permissions.filter((key) => !role.permissions.includes(key))
    : [];
  const lost = to
    ? role.permissions.filter((key) => !to.permissions.includes(key))
    : [];

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      onClose();
      await onMoved();
    },
    {
      success: intl.formatMessage(
        {
          id: 'roles.move.done',
          defaultMessage:
            '{count, plural, one {# member} other {# members}} moved to {role}',
        },
        { count, role: to ? nameOf(to) : '' },
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
      aria-labelledby={`${id}-title`}
    >
      <DialogTitle id={`${id}-title`}>
        {intl.formatMessage(
          {
            id: 'roles.move.title',
            defaultMessage: 'Move everyone from {role}',
          },
          { role: from },
        )}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error && <FormError message={error} />}
          <DialogContentText>
            {count <= NAMED
              ? intl.formatMessage(
                  {
                    id: 'roles.move.body.named',
                    defaultMessage:
                      '{count, plural, one {{names} holds {role}} other {{names} hold {role}}}. They move to the role you choose, and lose {role}. Anyone who already holds that role just loses {role}.',
                  },
                  {
                    count,
                    names: intl.formatList(
                      role.holders.map((holder) => holder.name),
                    ),
                    role: from,
                  },
                )
              : intl.formatMessage(
                  {
                    id: 'roles.move.body.counted',
                    defaultMessage:
                      '{count} members hold {role}. They move to the role you choose, and lose {role}. Anyone who already holds that role just loses {role}.',
                  },
                  { count, role: from },
                )}
          </DialogContentText>

          {choices.length === 0 ? (
            <DialogContentText>
              {intl.formatMessage({
                id: 'roles.move.noChoice',
                defaultMessage:
                  'Your roles don’t include everything any other role can do, so there’s no role you can move them to. An Owner can.',
              })}
            </DialogContentText>
          ) : (
            <TextField
              id={`${id}-to`}
              select
              required
              label={intl.formatMessage({
                id: 'roles.move.to',
                defaultMessage: 'Move them to',
              })}
              value={toRoleId}
              onChange={(event) => setToRoleId(event.target.value)}
              helperText={
                to && isOwnerRole(to)
                  ? intl.formatMessage({
                      id: 'roles.move.toOwner',
                      defaultMessage:
                        'An Owner holds no other role, so they lose their other roles too.',
                    })
                  : choices.length < roles.length - 1
                    ? intl.formatMessage({
                        id: 'roles.move.someLeftOut',
                        defaultMessage:
                          'Roles that can do more than yours aren’t offered.',
                      })
                    : undefined
              }
            >
              {choices.map((each) => (
                <MenuItem key={each.id} value={each.id}>
                  {nameOf(each)}
                </MenuItem>
              ))}
            </TextField>
          )}

          {/* Follows the choice, and is read out as it changes. */}
          <Box aria-live="polite">
            {to &&
              (gained.length === 0 && lost.length === 0 ? (
                <Typography>
                  {intl.formatMessage(
                    {
                      id: 'roles.move.same',
                      defaultMessage:
                        'With {role}, what they can do stays the same.',
                    },
                    { role: nameOf(to) },
                  )}
                </Typography>
              ) : (
                <Stack spacing={2}>
                  {gained.length > 0 && (
                    <Change
                      title={intl.formatMessage(
                        {
                          id: 'roles.move.gains',
                          defaultMessage: 'With {role}, they can also',
                        },
                        { role: nameOf(to) },
                      )}
                      permissions={gained}
                    />
                  )}
                  {lost.length > 0 && (
                    <Change
                      title={intl.formatMessage({
                        id: 'roles.move.loses',
                        defaultMessage: 'They can no longer',
                      })}
                      permissions={lost}
                    />
                  )}
                </Stack>
              ))}
          </Box>
        </Stack>
      </DialogContent>
      <DialogFooter
        submitting={submitting}
        onCancel={close}
        disabled={!to}
        label={intl.formatMessage(
          {
            id: 'roles.move.confirm',
            defaultMessage:
              'Move {count, plural, one {# member} other {# members}}',
          },
          { count },
        )}
        pendingLabel={intl.formatMessage({
          id: 'roles.move.moving',
          defaultMessage: 'Moving…',
        })}
        onConfirm={() =>
          void submit(() =>
            api(`/roles/${role.id}/move`, {
              method: 'POST',
              body: JSON.stringify({ toRoleId }),
            }),
          )
        }
      />
    </Dialog>
  );
}

/** What the move gives or takes, under its heading. */
function Change({
  title,
  permissions,
}: {
  title: string;
  permissions: readonly Permission[];
}) {
  const id = useId();

  return (
    <Stack component="section" aria-labelledby={id} spacing={0.75}>
      <Typography
        variant="subtitle1"
        component="h3"
        id={id}
        sx={{ fontWeight: 600 }}
      >
        {title}
      </Typography>
      <AccessList permissions={permissions} stacked />
    </Stack>
  );
}
