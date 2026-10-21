import { Box, Button, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { OrganizationInvitationPreview } from '../api/types.gen';
import { api } from '../lib/api';
import { formatDayLong } from '../lib/format';
import { organizationInitialsOf } from '../lib/person-initials';
import { browserTimeZone } from '../lib/time-zone';
import {
  AcceptSignedIn,
  InvitationLayout,
  KeepAccountFirst,
  NewAccountForm,
  OtherAddress,
  SignInThenAccept,
} from './invitation-parts';
import { useAuth } from './use-auth';

const bold = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

/**
 * An organization invitation's page (ADR-078): the operator's link to set
 * up a new organization, as its Owner. The same link shape, states and
 * forms as an invitation to join (invitation-page.tsx), worded for setting
 * one up: no inviter and no note, the Owner's role, and a line to check
 * the address, since changing one is not built yet.
 *
 * Accepting sends the browser's zone, which the new organization starts
 * in, as at registration (ADR-072). A printed link proves no inbox: the
 * account starts unconfirmed, and a confirmation email follows.
 */
export function OrganizationInvitation({
  token,
  invitation,
  locale,
  refusal,
  onStarted,
  onRefused,
  onSignedInAnyway,
  onKept,
}: {
  token: string;
  invitation: OrganizationInvitationPreview;
  locale: string;
  /** A refusal Set up met just after signing in on this page. */
  refusal: string | null;
  /** Set up: the session works in the new organization now. */
  onStarted: () => Promise<void>;
  /** A refusal Set up met, as the page words it, or null for ended. */
  onRefused: (caught: unknown) => Promise<string | null>;
  onSignedInAnyway: (message: string | null) => Promise<void>;
  /** The account kept, from the page: Set up appears. */
  onKept: () => Promise<void>;
}) {
  const intl = useIntl();
  const { session, refresh } = useAuth();
  const organization = invitation.organizationName;
  const title = setUpLabel(intl, organization);
  const above = <NewOrganizationMark name={organization} />;
  const header = <OwnerLine invitation={invitation} />;
  const until = <Until lastDay={invitation.lastDay} />;
  // With the browser's zone, which the new organization starts in.
  const accept = (body: Record<string, unknown>) =>
    api('/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ ...body, token, timeZone: browserTimeZone() }),
    });

  if (session) {
    if (session.user.email.toLowerCase() !== invitation.email) {
      return (
        <OtherAddress
          email={invitation.email}
          signedInAs={session.user.email}
          onSignedOut={refresh}
        />
      );
    }
    if (session.organization) {
      return <AlreadyInOrganization invitation={invitation} />;
    }
    if (session.user.deletionScheduledAt) {
      return (
        <KeepAccountFirst
          title={intl.formatMessage({
            id: 'invitation.organization.keep.title',
            defaultMessage: 'Keep your account to set it up',
          })}
          after={intl.formatMessage(
            {
              id: 'invitation.organization.keep.after',
              defaultMessage:
                'Set up appears here once it’s kept. This invitation works until the end of {date}.',
            },
            { date: formatDayLong(invitation.lastDay) },
          )}
          onKept={onKept}
        >
          <FormattedMessage
            id="invitation.organization.keep.body"
            defaultMessage="Your account is set to be deleted after <b>{date}</b>. Keep it, then set up {organization} as its {role}."
            values={{
              date: formatDayLong(session.user.deletionScheduledAt),
              organization,
              role: invitation.role.name,
              b: bold,
            }}
          />
        </KeepAccountFirst>
      );
    }
    return (
      <AcceptSignedIn
        title={title}
        above={above}
        header={header}
        until={until}
        email={session.user.email}
        refusal={refusal}
        accept={accept}
        onAccepted={onStarted}
        onRefused={onRefused}
        onSignedOut={refresh}
      />
    );
  }

  return invitation.hasAccount ? (
    <SignInThenAccept
      title={title}
      above={above}
      header={header}
      until={until}
      email={invitation.email}
      notice={intl.formatMessage({
        id: 'invitation.organization.hasAccount',
        defaultMessage:
          'You already have an account with this address. Sign in with your password, and the organization is set up with the account you have.',
      })}
      submitLabel={intl.formatMessage({
        id: 'invitation.organization.signInAndSetUp',
        defaultMessage: 'Sign in and set it up',
      })}
      accept={accept}
      onAccepted={onStarted}
      onRefused={onRefused}
      onSignedInAnyway={onSignedInAnyway}
    />
  ) : (
    <NewAccountForm
      title={title}
      above={above}
      header={
        <Box>
          {header}
          <Typography variant="body2" color="text.secondary">
            {intl.formatMessage({
              id: 'invitation.organization.rename',
              defaultMessage: 'You can change the name later, in Settings.',
            })}
          </Typography>
        </Box>
      }
      until={until}
      email={invitation.email}
      locale={locale}
      emailHelp={intl.formatMessage({
        id: 'invitation.organization.emailFixed',
        defaultMessage:
          'The invitation is for this address. You’ll sign in with it, and we’ll email it a link to confirm it’s yours.',
      })}
      belowEmail={
        <Typography variant="body2" sx={{ mt: 1 }}>
          <FormattedMessage
            id="invitation.organization.notYours"
            defaultMessage="<b>Not your address?</b> Don’t set it up here: ask whoever sent the link for one to your own address."
            values={{ b: bold }}
          />
        </Typography>
      }
      accept={accept}
      onAccepted={onStarted}
      onRefused={onRefused}
    />
  );
}

function setUpLabel(intl: ReturnType<typeof useIntl>, organization: string) {
  return intl.formatMessage(
    {
      id: 'invitation.organization.title',
      defaultMessage: 'Set up {organization}',
    },
    { organization },
  );
}

/**
 * The organization to be, above the heading: its initials in a dashed
 * tile, standing in for the logo it does not have yet.
 */
function NewOrganizationMark({ name }: { name: string }) {
  const intl = useIntl();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box
        aria-hidden
        sx={{
          width: 34,
          height: 34,
          flex: 'none',
          border: '1.5px dashed',
          borderColor: 'primary.light',
          borderRadius: 2,
          color: 'primary.main',
          fontWeight: 700,
          fontSize: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {organizationInitialsOf(name)}
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 700, lineHeight: 1.25 }}>
          {name}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'invitation.organization.newOrganization',
            defaultMessage: 'A new organization',
          })}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * As what: the Owner, and what that lets them do. The role's line stands
 * alone elsewhere, with a capital; after this colon it goes on in lower
 * case, as French writes it, and British English too.
 */
function OwnerLine({
  invitation,
}: {
  invitation: OrganizationInvitationPreview;
}) {
  const intl = useIntl();
  const description = invitation.role.description ?? '';
  return (
    <Typography>
      <FormattedMessage
        id="invitation.organization.owner"
        defaultMessage="You’ll be its <b>{role}</b>: {description}"
        values={{
          role: invitation.role.name,
          description:
            description.charAt(0).toLocaleLowerCase(intl.locale) +
            description.slice(1),
          b: bold,
        }}
      />
    </Typography>
  );
}

/** The link's last day, which holds wherever the person is. */
function Until({ lastDay }: { lastDay: string }) {
  const intl = useIntl();
  return (
    <Typography variant="body2" color="text.secondary">
      {intl.formatMessage(
        {
          id: 'invitation.organization.until',
          defaultMessage:
            'This invitation works until the end of {date}. Not expecting it? Close this page: nothing happens unless you set it up.',
        },
        { date: formatDayLong(lastDay) },
      )}
    </Typography>
  );
}

/**
 * The account already belongs to an organization: one person in two is
 * deferred (ADR-077), and only its owner is told why.
 */
function AlreadyInOrganization({
  invitation,
}: {
  invitation: OrganizationInvitationPreview;
}) {
  const intl = useIntl();
  return (
    <InvitationLayout
      title={intl.formatMessage({
        id: 'invitation.organization.otherOrganization.title',
        defaultMessage: 'You can’t start an organization with this account yet',
      })}
    >
      <Typography color="text.secondary">
        {intl.formatMessage(
          {
            id: 'invitation.organization.otherOrganization.body',
            defaultMessage:
              '{email} already belongs to an organization, and for now an account can belong to only one.',
          },
          { email: invitation.email },
        )}
      </Typography>
      <Typography color="text.secondary">
        {intl.formatMessage(
          {
            id: 'invitation.organization.otherOrganization.next',
            defaultMessage:
              'If you’re done with it, leave it from your account page, then open this link again before the end of {date}. Or ask whoever sent you the link for one to another address.',
          },
          { date: formatDayLong(invitation.lastDay) },
        )}
      </Typography>
      <Box>
        <Button variant="outlined" component={RouterLink} to="/account">
          {intl.formatMessage({
            id: 'invitation.otherOrganization.account',
            defaultMessage: 'Go to your account',
          })}
        </Button>
      </Box>
    </InvitationLayout>
  );
}
