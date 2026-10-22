import {
  Box,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { type ReactNode, type SubmitEvent, useId, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import { AccessList } from '../account/access-list';
import type { Member, Permission, Role } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { RoleChoices } from './role-choices';
import { isOwnerRole } from './role-names';

/**
 * Change roles (ADR-080): a member's roles as boxes to tick, Owner
 * standing alone, and beneath them what the member could do with those
 * ticked, in Your access's sentences, following each tick: with roles
 * added together, the clearest way to see what someone will be able to
 * do. Only roles the reader may give can be ticked; the page opens this
 * only for a member the reader may change. Mounted afresh for each
 * member (its key), so it starts from their roles.
 */
export function ChangeRolesDialog({
  open,
  member,
  roles,
  onClose,
  onChanged,
}: {
  open: boolean;
  member: Member;
  roles: readonly Role[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const intl = useIntl();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const titleId = useId();
  const summaryId = useId();
  const noneId = useId();
  const name = member.name || member.email;

  const [chosen, setChosen] = useState<string[]>(() =>
    member.roles.map((role) => role.id),
  );

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      onClose();
      await onChanged();
    },
    {
      success: intl.formatMessage(
        {
          id: 'members.changeRoles.saved',
          defaultMessage: '{name}’s roles changed',
        },
        { name },
      ),
    },
  );

  function close() {
    reset();
    onClose();
  }

  const ticked = roles.filter((role) => chosen.includes(role.id));
  const everything = ticked.some(isOwnerRole);
  const permissions: Permission[] = [
    ...new Set(ticked.flatMap((role) => role.permissions)),
  ];
  const none = chosen.length === 0;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (none) return;
    void submit(() =>
      api(`/users/${member.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ roleIds: chosen }),
      }),
    );
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
      fullScreen={phone}
      aria-labelledby={titleId}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}
      >
        <DialogTitle id={titleId}>
          {intl.formatMessage(
            {
              id: 'members.changeRoles.title',
              defaultMessage: 'Change {name}’s roles',
            },
            { name },
          )}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {error && <FormError message={error} />}
            <DialogContentText>
              {intl.formatMessage(
                {
                  id: 'members.changeRoles.lead',
                  defaultMessage:
                    '{name} may do whatever any of their roles allows. Changes reach them on their next click.',
                },
                { name },
              )}
            </DialogContentText>

            <RoleChoices
              roles={roles}
              value={chosen}
              onChange={setChosen}
              ownerReason={intl.formatMessage({
                id: 'members.changeRoles.ownerOnly',
                defaultMessage: 'Only an Owner can make someone an Owner.',
              })}
              problem={
                none
                  ? intl.formatMessage({
                      id: 'members.roles.chooseOne',
                      defaultMessage: 'Choose at least one role.',
                    })
                  : null
              }
            />

            <Stack
              component="section"
              aria-labelledby={summaryId}
              spacing={0.75}
            >
              <Typography
                variant="subtitle1"
                component="h3"
                id={summaryId}
                sx={{ fontWeight: 600 }}
              >
                {intl.formatMessage(
                  {
                    id: 'members.changeRoles.summary',
                    defaultMessage: 'With these roles, {name} can',
                  },
                  { name },
                )}
              </Typography>
              {/* Follows each tick, and is read out as it changes. */}
              <Box aria-live="polite">
                {everything ? (
                  <Typography>
                    <FormattedMessage
                      id="members.changeRoles.everything"
                      defaultMessage="<b>Everything</b>, including settings and closing the organization."
                      values={{
                        b: (chunks: ReactNode[]) => <strong>{chunks}</strong>,
                      }}
                    />
                  </Typography>
                ) : none ? (
                  <Typography id={noneId} color="text.secondary">
                    {intl.formatMessage({
                      id: 'members.changeRoles.nothing',
                      defaultMessage: 'Nothing, until a role is ticked.',
                    })}
                  </Typography>
                ) : (
                  <AccessList permissions={permissions} stacked />
                )}
              </Box>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogFooter
          submitting={submitting}
          onCancel={close}
          disabled={none}
          describedBy={none ? noneId : undefined}
          label={intl.formatMessage({
            id: 'members.changeRoles.save',
            defaultMessage: 'Save roles',
          })}
          pendingLabel={intl.formatMessage({
            id: 'members.changeRoles.saving',
            defaultMessage: 'Saving…',
          })}
        />
      </Box>
    </Dialog>
  );
}
