import PersonAddAlt from '@mui/icons-material/PersonAddAlt';
import { Alert, Button, Link, Stack, Typography } from '@mui/material';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';

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
import { useToast } from '../components/use-toast';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { api, ApiError, isRevisionRefusal, messageFor } from '../lib/api';
import { openDialog } from '../lib/open-dialog';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useFailureWords } from '../lib/use-failure-words';
import { refusalLabel } from './invitation-words';
import { InviteDialog } from './invite-dialog';
import { copyToClipboard, type InviteView } from './invite-view';
import { InvitedSection } from './invited-section';
import { MembersSection } from './members-section';

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
  // A read's failure as it came, worded as the page renders (ADR-081), or
  // the page's own words.
  const [error, setError] = useState<unknown>(null);
  const errorWords = useFailureWords(error);
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
  const heading = useRef<HTMLHeadingElement>(null);
  // A member removed takes their row and its menu with them: once the
  // list without them is on screen, and the dialog has let focus go, the
  // page begins again at its heading, as Home's does when a card is
  // dismissed.
  const refocus = useRef(false);
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    heading.current?.focus();
  }, [members]);

  const loading = members === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  // Together: each member's roles by id, and the roles list, which says
  // which of them the reader may give (ADR-080), for every row's menu,
  // Invite and Invited.
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
      setError(caught);
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
        if (ignore) return;
        setError(caught);
      });

    return () => {
      ignore = true;
    };
  }, [read]);

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

  if (!members && isRevisionRefusal(error)) {
    return <RevisionRefusalPage failure={error} onRetry={() => void load()} />;
  }

  return (
    // Heading draws immediately; only the table holds space and fills in.
    <Stack spacing={3}>
      <PageHeader
        headingRef={heading}
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
        <FormattedMessage
          id="members.intro"
          defaultMessage="Everyone here signs in with their own email and password. A member can hold several roles, and may do whatever any of them allows: <link>Roles</link> says what each one can do."
          values={{
            link: (chunks: ReactNode[]) => (
              <Link
                component={RouterLink}
                to="/settings/roles"
                underline="always"
              >
                {chunks}
              </Link>
            ),
          }}
        />
      </Typography>

      {errorWords && <Alert severity="error">{errorWords}</Alert>}

      {/* None pending, no heading: Invite is how to add someone. */}
      {invitations.length > 0 && (
        <InvitedSection
          invitations={invitations}
          roles={roles}
          selfId={session?.user.id}
          busy={rowBusy}
          actions={{
            resend: (invitation) => void resend(invitation),
            copy: (invitation) => void copy(invitation),
          }}
          onRevoked={load}
        />
      )}

      <MembersSection
        members={members}
        roles={roles}
        selfId={session?.user.id}
        organizationName={session?.organization?.name ?? ''}
        loading={loading}
        showSkeleton={showSkeleton}
        onChanged={load}
        onRemoved={() => {
          refocus.current = true;
          return load();
        }}
      />
    </Stack>
  );
}
