import PersonAddAlt from '@mui/icons-material/PersonAddAlt';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSearchParams } from 'react-router-dom';

import type {
  CopiedInvitationLink,
  Invitation,
  InvitationEnvelope,
  Member,
  Role,
} from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { PageHeader } from '../components/page-header';
import { PersonAvatar } from '../components/person-avatar';
import { useToast } from '../components/use-toast';
import { api, ApiError, messageFor } from '../lib/api';
import { formatMoment } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import { EMAIL_MAX_WIDTH } from '../lib/text-limits';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { activeLabel } from '../people/people-types';
import { refusalLabel } from './invitation-words';
import { InviteDialog } from './invite-dialog';
import { copyToClipboard, type InviteView } from './invite-view';
import { InvitedSection } from './invited-section';
import { roleLabel, roleList } from './role-names';

const FORM: InviteView = { kind: 'form' };

export function MembersPage() {
  const intl = useIntl();
  const { session } = useAuth();
  const can = useCan();

  const toast = useToast();
  // Invitations are for those who may invite (ADR-077): users.create.
  const inviting = can('users.create');

  const [members, setMembers] = useState<Member[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // The Invite dialog, where it opens, and a count that mounts it afresh
  // for each opening.
  const [invite, setInvite] = useState<{ start: InviteView; key: number }>({
    start: FORM,
    key: 0,
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  // Getting started opens Invite through the address, ?invite. Closing
  // takes it off, so Back or a reload does not open it again.
  const [params, setParams] = useSearchParams();
  const asked = inviting && params.has('invite');
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const loading = members === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  // Both in one round trip. The members list carries roleId rather than a
  // name — the id is what PATCH takes and what survives a rename — and the
  // roles list is needed for the dropdown regardless.
  const read = useCallback(
    () =>
      Promise.all([
        api<Member[]>('/users'),
        api<Role[]>('/roles'),
        inviting ? api<Invitation[]>('/invitations') : Promise.resolve([]),
      ]),
    [inviting],
  );

  const load = useCallback(async () => {
    try {
      const [nextMembers, nextRoles, nextInvitations] = await read();

      setMembers(nextMembers);
      setRoles(nextRoles);
      setInvitations(nextInvitations);
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [read]);

  useEffect(() => {
    let ignore = false;

    void read()
      .then(([nextMembers, nextRoles, nextInvitations]) => {
        if (ignore) return;
        setMembers(nextMembers);
        setRoles(nextRoles);
        setInvitations(nextInvitations);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [read]);

  const isOwner =
    session?.organization?.roles.some(
      (role) => role.builtIn && role.name === 'Owner',
    ) ?? false;

  function openInvite(start: InviteView) {
    setInvite((current) => ({ start, key: current.key + 1 }));
    setInviteOpen(true);
  }

  /** A row's refusal in words, as the Invite dialog says it. */
  function refusal(caught: unknown): string {
    const refused = caught instanceof ApiError ? caught : null;
    return refusalLabel(
      {
        message: messageFor(caught),
        code: refused?.code ?? null,
        details: refused?.details ?? null,
      },
      session?.organization?.name ?? '',
      intl,
    );
  }

  async function resend(invitation: Invitation) {
    setRowBusy(invitation.id);
    setError(null);
    try {
      const { invitation: next } = await api<InvitationEnvelope>(
        `/invitations/${invitation.id}/resend`,
        { method: 'POST' },
      );
      await load();
      if (next.link.status === 'notSent') {
        openInvite({ kind: 'notSent', invitation: next });
      } else {
        toast(
          intl.formatMessage(
            {
              id: 'members.invited.resent',
              defaultMessage: 'Invitation sent again to {email}',
            },
            { email: next.email },
          ),
        );
      }
    } catch (caught) {
      setError(refusal(caught));
    } finally {
      setRowBusy(null);
    }
  }

  async function copy(invitation: Invitation) {
    setRowBusy(invitation.id);
    setError(null);
    try {
      const made = await api<CopiedInvitationLink>(
        `/invitations/${invitation.id}/link`,
        { method: 'POST' },
      );
      const copied = await copyToClipboard(made.link);
      await load();
      openInvite({
        kind: 'copied',
        invitation: made.invitation,
        link: made.link,
        // The link that was out is spent now, and the dialog says so.
        replaces:
          invitation.link.status === 'emailed' ||
          invitation.link.status === 'copied'
            ? invitation.link.status
            : null,
        copied,
      });
    } catch (caught) {
      setError(refusal(caught));
    } finally {
      setRowBusy(null);
    }
  }

  async function changeRole(memberId: string, roleId: string) {
    setSaving(memberId);
    setError(null);

    try {
      await api(`/users/${memberId}`, {
        method: 'PATCH',
        // One until Change roles offers several (ADR-080).
        body: JSON.stringify({ roleIds: [roleId] }),
      });

      // Re-read rather than patching the row locally: the server is the only
      // thing that knows whether the change was allowed and what the row now
      // holds.
      await load();
    } catch (caught) {
      // The server's message, not a guess. A 403 means the caller may not
      // grant that role; a 409 means this is the last Owner. The client
      // cannot reliably tell which applies before asking, which is why the
      // options are not hidden.
      setError(messageFor(caught));
    } finally {
      setSaving(null);
    }
  }

  return (
    // Heading draws immediately; only the table holds space and fills in.
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.menu.members',
          defaultMessage: 'Members',
        })}
        actions={
          <>
            <Button
              variant="text"
              disabled={loading}
              onClick={() => void load()}
            >
              {intl.formatMessage({
                id: 'common.refresh',
                defaultMessage: 'Refresh',
              })}
            </Button>

            {/* Hidden without users.create — display only, since the 403 is the
            actual control (ADR-016). */}
            {inviting && (
              <Button
                variant="contained"
                startIcon={<PersonAddAlt />}
                disabled={loading}
                onClick={openDialog(() => openInvite(FORM))}
              >
                {intl.formatMessage({
                  id: 'members.invite',
                  defaultMessage: 'Invite',
                })}
              </Button>
            )}
          </>
        }
      />

      {inviting && (
        <InviteDialog
          key={`invite-${invite.key}`}
          // Asked for by the address, once the roles it offers have come.
          open={inviteOpen || (asked && !loading)}
          start={invite.start}
          roles={roles}
          members={members ?? []}
          invitations={invitations}
          isOwner={isOwner}
          onClose={() => {
            setInviteOpen(false);
            if (asked) {
              setParams(
                (current) => {
                  const next = new URLSearchParams(current);
                  next.delete('invite');
                  return next;
                },
                { replace: true },
              );
            }
          }}
          onChanged={load}
        />
      )}

      <Typography color="text.secondary">
        {inviting
          ? intl.formatMessage({
              id: 'members.lead',
              defaultMessage:
                'Everyone here signs in with their own email and password. To add someone, invite them: they choose their password when they accept.',
            })
          : intl.formatMessage({
              id: 'members.lead.noInvite',
              defaultMessage:
                'Everyone here signs in with their own email and password. An Owner or an Admin invites new members.',
            })}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {/* None pending, no heading: the line above says how to add someone. */}
      {invitations.length > 0 && (
        <InvitedSection
          invitations={invitations}
          isOwner={isOwner}
          selfId={session?.user.id}
          busy={rowBusy}
          actions={{
            resend: (invitation) => void resend(invitation),
            copy: (invitation) => void copy(invitation),
          }}
          onRevoked={load}
        />
      )}

      <Paper
        variant="outlined"
        component="section"
        aria-labelledby="members-heading"
      >
        <Typography
          variant="h6"
          component="h2"
          id="members-heading"
          sx={{ px: 2.5, pt: 2, pb: 1.5 }}
        >
          {members ? (
            <FormattedMessage
              id="members.heading"
              defaultMessage="Members <muted>{count}</muted>"
              values={{
                count: members.length,
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
          ) : (
            intl.formatMessage({
              id: 'layout.menu.members',
              defaultMessage: 'Members',
            })
          )}
        </Typography>
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? (
              <>
                <Skeleton height={48} />
                <Skeleton height={48} />
              </>
            ) : null}
          </Stack>
        ) : (
          <TableContainer>
            <Table
              aria-label={intl.formatMessage({
                id: 'layout.menu.members',
                defaultMessage: 'Members',
              })}
            >
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'common.name',
                      defaultMessage: 'Name',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'auth.field.email',
                      defaultMessage: 'Email',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'members.role',
                      defaultMessage: 'Role',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'people.lastActive',
                      defaultMessage: 'Last active',
                    })}
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {members?.map((member) => {
                  const isSelf = member.id === session?.user.id;

                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        {/* Their face beside their name (ADR-063). */}
                        <Stack
                          direction="row"
                          spacing={1.5}
                          sx={{ alignItems: 'center' }}
                        >
                          <PersonAvatar
                            userId={member.id}
                            name={member.name}
                            email={member.email}
                            photoFileId={member.photoFileId}
                          />
                          <span>{member.name}</span>
                        </Stack>
                      </TableCell>
                      <TableCell
                        title={member.email}
                        sx={{
                          maxWidth: EMAIL_MAX_WIDTH,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {member.email}
                      </TableCell>
                      <TableCell>
                        {/* Rendered as plain text when the caller lacks
                          roles.assign, the permission the server checks.
                          That is display only — the 403 from the server is
                          the actual control (ADR-016). */}
                        {can('roles.assign') ? (
                          // Its own name, as no visible label sits on it:
                          // the column says Role, the row says whose.
                          <Select
                            size="small"
                            inputProps={{
                              'aria-label': intl.formatMessage(
                                {
                                  id: 'members.roleOf',
                                  defaultMessage: 'Role of {name}',
                                },
                                { name: member.name || member.email },
                              ),
                            }}
                            value={member.roles[0]?.id ?? ''}
                            disabled={saving !== null}
                            onChange={(event) =>
                              void changeRole(member.id, event.target.value)
                            }
                          >
                            {roles.map((role) => (
                              <MenuItem key={role.id} value={role.id}>
                                {roleLabel(role.name)}
                              </MenuItem>
                            ))}
                          </Select>
                        ) : (
                          roleList(member.roles)
                        )}

                        {/* Not disabled: an Owner may legitimately demote
                          themselves once a second Owner exists, and the
                          server answers 409 when they cannot. */}
                        {isSelf && (
                          <Typography
                            variant="caption"
                            sx={{ ml: 1 }}
                            color="text.secondary"
                          >
                            {intl.formatMessage({
                              id: 'members.you',
                              defaultMessage: 'you',
                            })}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell
                        sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}
                        title={
                          member.lastActiveAt
                            ? formatMoment(member.lastActiveAt)
                            : undefined
                        }
                      >
                        {activeLabel(member, intl)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Stack>
  );
}
