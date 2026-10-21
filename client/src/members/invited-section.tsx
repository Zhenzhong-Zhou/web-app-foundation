import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { type ReactNode, useId, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

import type { Invitation, Role } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { StatusChip } from '../components/status-chip';
import { api } from '../lib/api';
import { EMAIL_MAX_WIDTH } from '../lib/text-limits';
import { useSubmit } from '../lib/use-submit';
import { STATUS_TONES } from '../theme/status';
import { HIDDEN } from './hidden';
import { invitedByLabel, linkStatusLabel } from './invitation-words';
import { mayGiveAll, roleList } from './role-names';

/** What a row's buttons do; the page holds the dialog they open. */
export interface InvitedActions {
  resend: (invitation: Invitation) => void;
  copy: (invitation: Invitation) => void;
}

/**
 * Members' Invited (ADR-077): each pending invitation, its roles, who sent
 * it and when, and where its link stands, with Resend, Copy link and
 * Revoke. Nobody here is a member until they accept. Only someone who may
 * give every role an invitation names sees its buttons (ADR-080), so an
 * Admin sees none on an Owner's. On a phone each row is a card.
 */
export function InvitedSection({
  invitations,
  roles,
  selfId,
  busy,
  actions,
  onRevoked,
}: {
  invitations: Invitation[];
  /** The organization's roles, each saying whether the reader may give it. */
  roles: readonly Role[];
  selfId: string | undefined;
  /** The invitation a row action is working on, its buttons held. */
  busy: string | null;
  actions: InvitedActions;
  onRevoked: () => Promise<void>;
}) {
  const intl = useIntl();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const headingId = useId();
  const [revoking, setRevoking] = useState<Invitation | null>(null);

  const roleName = (invitation: Invitation) => roleList(invitation.roles);
  const buttons = (invitation: Invitation) =>
    !mayGiveAll(roles, invitation.roles) ? null : (
      <RowButtons
        invitation={invitation}
        disabled={busy !== null}
        stretch={phone}
        onResend={() => actions.resend(invitation)}
        onCopy={() => actions.copy(invitation)}
        onRevoke={() => setRevoking(invitation)}
      />
    );

  const chip = (invitation: Invitation) => (
    <StatusChip
      tone={STATUS_TONES.invitation[invitation.link.status]}
      label={linkStatusLabel(invitation.link, intl)}
    />
  );

  const heading = (
    <Stack spacing={0.5} sx={phone ? undefined : { px: 2.5, pt: 2, pb: 1.5 }}>
      <Typography variant="h6" component="h2" id={headingId}>
        <FormattedMessage
          id="members.invited.heading"
          defaultMessage="Invited <muted>{count}</muted>"
          values={{
            count: invitations.length,
            muted: (chunks: ReactNode[]) => (
              <Box
                component="span"
                sx={{ color: 'text.secondary', fontWeight: 400 }}
              >
                {chunks}
              </Box>
            ),
          }}
        />
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({
          id: 'members.invited.lead',
          defaultMessage:
            'Each link works once, for 7 days. Nobody is a member until they accept.',
        })}
      </Typography>
    </Stack>
  );

  return (
    <Box component="section" aria-labelledby={headingId}>
      {phone ? (
        <Stack spacing={1.25}>
          {heading}
          {invitations.map((invitation) => (
            <Paper
              key={invitation.id}
              variant="outlined"
              sx={{ p: 1.75 }}
              aria-label={invitation.email}
              component="article"
            >
              <Stack spacing={1}>
                <Typography
                  sx={{
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={invitation.email}
                >
                  {invitation.email}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {intl.formatMessage(
                    {
                      id: 'members.invited.roleAndBy',
                      defaultMessage: '{role} · {by}',
                    },
                    {
                      role: roleName(invitation),
                      by: invitedByLabel(invitation, selfId, intl),
                    },
                  )}
                </Typography>
                <Box>{chip(invitation)}</Box>
                {buttons(invitation)}
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
        <Paper variant="outlined">
          {heading}
          <TableContainer>
            <Table
              aria-label={intl.formatMessage({
                id: 'members.invited.title',
                defaultMessage: 'Invited',
              })}
            >
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'members.invited.person',
                      defaultMessage: 'Person',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'members.roles',
                      defaultMessage: 'Roles',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'members.invited.link',
                      defaultMessage: 'Link',
                    })}
                  </TableCell>
                  <TableCell>
                    <Box component="span" sx={HIDDEN}>
                      {intl.formatMessage({
                        id: 'common.actions',
                        defaultMessage: 'Actions',
                      })}
                    </Box>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell sx={{ maxWidth: EMAIL_MAX_WIDTH }}>
                      <Box
                        sx={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={invitation.email}
                      >
                        {invitation.email}
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {invitedByLabel(invitation, selfId, intl)}
                      </Typography>
                    </TableCell>
                    <TableCell>{roleName(invitation)}</TableCell>
                    <TableCell>{chip(invitation)}</TableCell>
                    <TableCell align="right">{buttons(invitation)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <RevokeDialog
        invitation={revoking}
        onClose={() => setRevoking(null)}
        onRevoked={onRevoked}
      />
    </Box>
  );
}

/** Resend, Copy link and Revoke, each named for its person. */
function RowButtons({
  invitation,
  disabled,
  stretch,
  onResend,
  onCopy,
  onRevoke,
}: {
  invitation: Invitation;
  disabled: boolean;
  stretch: boolean;
  onResend: () => void;
  onCopy: () => void;
  onRevoke: () => void;
}) {
  const intl = useIntl();
  const { email } = invitation;
  const each = stretch ? { flex: '1 1 auto' } : undefined;

  return (
    <Stack
      direction="row"
      spacing={0.75}
      useFlexGap
      sx={{
        flexWrap: 'wrap',
        justifyContent: stretch ? 'stretch' : 'flex-end',
      }}
    >
      <Button
        variant="outlined"
        disabled={disabled}
        onClick={onResend}
        aria-label={intl.formatMessage(
          {
            id: 'members.invited.resendTo',
            defaultMessage: 'Resend to {email}',
          },
          { email },
        )}
        sx={each}
      >
        {intl.formatMessage({
          id: 'members.invited.resend',
          defaultMessage: 'Resend',
        })}
      </Button>
      <Button
        variant="outlined"
        disabled={disabled}
        onClick={onCopy}
        aria-label={intl.formatMessage(
          {
            // Its visible words first, so a voice command finds it (WCAG
            // 2.5.3), then whose.
            id: 'members.invited.copyFor',
            defaultMessage: 'Copy link for {email}',
          },
          { email },
        )}
        sx={each}
      >
        {intl.formatMessage({
          id: 'members.invited.copyLink',
          defaultMessage: 'Copy link',
        })}
      </Button>
      <Button
        variant="outlined"
        color="error"
        disabled={disabled}
        onClick={onRevoke}
        aria-label={intl.formatMessage(
          {
            id: 'members.invited.revokeFor',
            defaultMessage: 'Revoke the invitation for {email}',
          },
          { email },
        )}
        sx={each}
      >
        {intl.formatMessage({
          id: 'members.invited.revoke',
          defaultMessage: 'Revoke',
        })}
      </Button>
    </Stack>
  );
}

/** Revoke, asked first: a link someone may be about to open stops at once. */
function RevokeDialog({
  invitation,
  onClose,
  onRevoked,
}: {
  invitation: Invitation | null;
  onClose: () => void;
  onRevoked: () => Promise<void>;
}) {
  const intl = useIntl();
  const email = invitation?.email ?? '';

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      onClose();
      await onRevoked();
    },
    {
      success: intl.formatMessage(
        {
          id: 'members.invited.revoked',
          defaultMessage: 'Invitation for {email} revoked',
        },
        { email },
      ),
    },
  );

  function close() {
    reset();
    onClose();
  }

  return (
    <Dialog
      open={invitation !== null}
      onClose={submitting ? undefined : close}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>
        {intl.formatMessage(
          {
            id: 'members.invited.revokeTitle',
            defaultMessage: 'Revoke the invitation for {email}?',
          },
          { email },
        )}
      </DialogTitle>
      <DialogContent>
        {error && (
          <DialogContentText color="error" sx={{ mb: 1 }}>
            {error}
          </DialogContentText>
        )}
        <DialogContentText>
          {intl.formatMessage({
            id: 'members.invited.revokeBody',
            defaultMessage:
              'Its link stops working. You can invite them again.',
          })}
        </DialogContentText>
      </DialogContent>
      <DialogFooter
        submitting={submitting}
        onCancel={close}
        destructive
        label={intl.formatMessage({
          id: 'members.invited.revoke',
          defaultMessage: 'Revoke',
        })}
        pendingLabel={intl.formatMessage({
          id: 'members.invited.revoking',
          defaultMessage: 'Revoking…',
        })}
        onConfirm={() =>
          void submit(() =>
            api(`/invitations/${invitation?.id ?? ''}`, { method: 'DELETE' }),
          )
        }
      />
    </Dialog>
  );
}
