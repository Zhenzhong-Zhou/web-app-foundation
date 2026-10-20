import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Link as RouterLink,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import type { InvitationPreview, InvitationRead } from '../api/types.gen';
import { useLanguage } from '../i18n/use-language';
import { api, ApiError, hasCode, messageFor } from '../lib/api';
import { formatDayLong } from '../lib/format';
import type { Locale } from '../lib/locales';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { looksLikeToken } from '../lib/validation';
import { authMessageFor } from './auth-message';
import {
  AcceptSignedIn,
  Ended,
  InvitationLayout,
  KeepAccountFirst,
  LanguageNoticeProvider,
  NewAccountForm,
  OtherAddress,
  SignInThenAccept,
} from './invitation-parts';
import { OrganizationInvitation } from './organization-invitation';
import { useAuth } from './use-auth';

const bold = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

/**
 * The invitation page (ADR-077), among the signed-out pages: whoever holds
 * the link reads who invited them, to which organization and as what, and
 * joins, by creating an account or by signing in to theirs. It starts in
 * the invitation's language, and reads it again in any other the page is
 * switched to, so the role is in the page's words. Reading spends nothing;
 * only Join does. A read again in another language that fails leaves the
 * page as it was, in its language, with everything typed, and says so
 * under the language choice.
 *
 * Signed in, it joins that account, or says why it cannot: another
 * address's, with Sign out; one in another organization; one set to be
 * deleted, with Keep my account first. Signed in, it stays in the
 * account's own language: only a newcomer has none (ADR-054).
 *
 * Who invited them is named while they are still a member; once they have
 * left or deleted their account, the organization alone (ADR-077).
 *
 * The same link shape opens an organization invitation (ADR-078): the read
 * says which, and that one sets up a new organization instead of joining
 * one (organization-invitation.tsx).
 */
export function InvitationPage() {
  const intl = useIntl();
  const [languageKept, setLanguageKept] = useState(false);

  return (
    <LanguageNoticeProvider
      value={
        languageKept ? (
          <Alert severity="info" role="status">
            {intl.formatMessage({
              id: 'invitation.languageKept',
              defaultMessage:
                'The page couldn’t change language just now, so it stays as it was. Try again in a minute.',
            })}
          </Alert>
        ) : null
      }
    >
      <Invitation onLanguageKept={setLanguageKept} />
    </LanguageNoticeProvider>
  );
}

/** The page the invitation and the session call for. */
function Invitation({
  onLanguageKept,
}: {
  /** Whether a change of language was undone, its read having failed. */
  onLanguageKept: (kept: boolean) => void;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const { session, refresh } = useAuth();
  const { locale, setLocale } = useLanguage();
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token'));
  const malformed = !looksLikeToken(token);

  // undefined while it is read; null for a link that has ended.
  const [read, setRead] = useState<InvitationRead | null | undefined>(
    malformed ? null : undefined,
  );
  const [failure, setFailure] = useState<string | null>(null);
  // Try again after a read that failed: each try reads again.
  const [attempt, setAttempt] = useState(0);
  // A refusal Join met after signing in here, carried to the signed-in
  // Join the page then shows.
  const [carried, setCarried] = useState<string | null>(null);
  const started = useRef(false);
  // The language the invitation was last read in: a change of language
  // reads it again, and one whose read fails goes back here.
  const readIn = useRef<Locale | null>(null);
  const showLoading = useDelayedFlag(read === undefined && !failure);
  const signedIn = session !== null;

  useEffect(() => {
    if (malformed) return;
    // Read in this language already, or just gone back to it.
    if (readIn.current === locale) return;
    let ignore = false;

    void api<InvitationRead>('/invitations/read', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then((response) => {
        if (ignore) return;
        readIn.current = locale;
        onLanguageKept(false);
        setRead(response);
        // In the invitation's language to start with, once: a choice made
        // on the page after that stays. Signed in, the account's own.
        const preview = response.invitation ?? response.organizationInvitation;
        if (preview && !started.current) {
          started.current = true;
          if (!signedIn && preview.locale !== locale) {
            setLocale(preview.locale);
          }
        }
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        // Read before, in another language: the page stays as it was, in
        // that language, never a failed page in place of a form half done.
        if (readIn.current) {
          onLanguageKept(true);
          setLocale(readIn.current);
          return;
        }
        setFailure(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [token, malformed, locale, setLocale, signedIn, attempt, onLanguageKept]);

  /** Joined: the session works in the organization now. */
  async function joined() {
    await refresh();
    navigate('/', { replace: true });
  }

  /**
   * Signed in here, though Join was then refused: the page moves to Join
   * as that account, the refusal with it, so trying again joins without
   * signing in a second time, which would make another session and send
   * another new sign-in email.
   */
  async function signedInAnyway(message: string | null) {
    setCarried(message);
    await refresh();
  }

  /**
   * Kept, from the page: a refusal carried here was the deletion's, and
   * goes with it, so Join or Set up appears without it.
   */
  async function kept() {
    setCarried(null);
    await refresh();
  }

  /**
   * A refusal Join met. An ended link reads as ended, by its code; one the
   * session now explains (another organization, a deletion set) reads
   * from it; any other, a field the server refused among them, as the
   * server says it.
   */
  async function refused(caught: unknown): Promise<string | null> {
    if (
      caught instanceof ApiError &&
      hasCode(caught.code ?? null, 'invitation_ended')
    ) {
      setRead(null);
      return null;
    }
    if (
      caught instanceof ApiError &&
      caught.status === 409 &&
      (hasCode(caught.code ?? null, 'account_deletion_scheduled') ||
        session === null)
    ) {
      await refresh();
    }
    return authMessageFor(caught);
  }

  if (failure) {
    return (
      <InvitationLayout
        title={intl.formatMessage({
          id: 'invitation.loadFailed',
          defaultMessage: 'This invitation could not be opened',
        })}
      >
        <Alert severity="error">{failure}</Alert>
        <Box>
          <Button
            variant="outlined"
            onClick={() => {
              setFailure(null);
              setAttempt((count) => count + 1);
            }}
          >
            {intl.formatMessage({
              id: 'common.tryAgain',
              defaultMessage: 'Try again',
            })}
          </Button>
        </Box>
      </InvitationLayout>
    );
  }
  if (read === undefined) {
    return showLoading ? (
      <Stack
        sx={{
          minHeight: '50vh',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Stack>
    ) : null;
  }
  if (read?.organizationInvitation) {
    return (
      <OrganizationInvitation
        token={token!}
        invitation={read.organizationInvitation}
        locale={locale}
        refusal={carried}
        onStarted={joined}
        onRefused={refused}
        onSignedInAnyway={signedInAnyway}
        onKept={kept}
      />
    );
  }
  const invitation = read?.invitation;
  if (!invitation) return <Ended />;

  const organization = invitation.organization.name;
  const join = joinLabel(intl, organization);
  const above = <OrganizationMark invitation={invitation} />;
  const header = <InvitationHeader invitation={invitation} />;
  const until = <Until lastDay={formatDayLong(invitation.lastDay)} />;
  const accept = (body: Record<string, unknown>) =>
    api('/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ ...body, token }),
    });

  if (invitation.organization.deletionScheduledAt) {
    return (
      <InvitationLayout
        title={intl.formatMessage(
          {
            id: 'invitation.closing.title',
            defaultMessage: '{organization} isn’t taking new members',
          },
          { organization },
        )}
      >
        <Typography color="text.secondary">
          {invitation.inviter
            ? intl.formatMessage(
                {
                  id: 'invitation.closing.body',
                  defaultMessage:
                    'It’s being closed, and will be deleted after {date}. Ask {inviter}, who invited you, if you were expecting to join.',
                },
                {
                  date: formatDayLong(
                    invitation.organization.deletionScheduledAt,
                  ),
                  inviter: invitation.inviter.name,
                },
              )
            : intl.formatMessage(
                {
                  id: 'invitation.closing.bodyOrganization',
                  defaultMessage:
                    'It’s being closed, and will be deleted after {date}.',
                },
                {
                  date: formatDayLong(
                    invitation.organization.deletionScheduledAt,
                  ),
                },
              )}
        </Typography>
      </InvitationLayout>
    );
  }

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
      return <OtherOrganization invitation={invitation} />;
    }
    if (session.user.deletionScheduledAt) {
      return (
        <KeepAccountFirst
          title={intl.formatMessage({
            id: 'invitation.keep.title',
            defaultMessage: 'Keep your account to join',
          })}
          after={intl.formatMessage(
            {
              id: 'invitation.keep.after',
              defaultMessage:
                'Join appears here once it’s kept. This invitation works until {date}.',
            },
            { date: formatDayLong(invitation.lastDay) },
          )}
          onKept={kept}
        >
          <FormattedMessage
            id="invitation.keep.body"
            defaultMessage="Your account is set to be deleted after <b>{date}</b>. Keep it, then join {organization} as {role, select, Owner {an} Admin {an} other {a}} {role}."
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
        title={join}
        above={above}
        header={header}
        until={until}
        email={session.user.email}
        refusal={carried}
        accept={accept}
        onAccepted={joined}
        onRefused={refused}
        onSignedOut={refresh}
      />
    );
  }

  return invitation.hasAccount ? (
    <SignInThenAccept
      title={join}
      above={above}
      header={header}
      until={until}
      email={invitation.email}
      notice={intl.formatMessage({
        id: 'invitation.hasAccount',
        defaultMessage:
          'You already have an account with this address. Sign in with your password to join.',
      })}
      submitLabel={intl.formatMessage({
        id: 'invitation.signInAndJoin',
        defaultMessage: 'Sign in and join',
      })}
      accept={accept}
      onAccepted={joined}
      onRefused={refused}
      onSignedInAnyway={signedInAnyway}
    />
  ) : (
    <NewAccountForm
      title={join}
      above={above}
      header={header}
      until={until}
      email={invitation.email}
      locale={locale}
      emailHelp={intl.formatMessage({
        id: 'invitation.emailFixed',
        defaultMessage:
          'The invitation is for this address. You’ll sign in with it.',
      })}
      accept={accept}
      onAccepted={joined}
      onRefused={refused}
    />
  );
}

/** The organization, by its logo and its name, above the heading. */
function OrganizationMark({ invitation }: { invitation: InvitationPreview }) {
  const { logo, name } = invitation.organization;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      {/* From the read itself: a signed-out page cannot read the file
          route (ADR-077). The name beside it says what it is. */}
      {logo && (
        <Box
          component="img"
          src={logo}
          alt=""
          sx={{ display: 'block', maxHeight: 32, maxWidth: 128 }}
        />
      )}
      <Typography sx={{ fontWeight: 700 }}>{name}</Typography>
    </Box>
  );
}

/**
 * Who invited them, by name and by address so the page can be told from a
 * forgery, as the email does; as what, what that lets them do, and their
 * note. Once the inviter has gone, the organization (ADR-077).
 */
function InvitationHeader({ invitation }: { invitation: InvitationPreview }) {
  const intl = useIntl();
  const { inviter, role, note } = invitation;
  const organization = invitation.organization.name;

  return (
    <>
      <Box>
        <Typography>
          {inviter ? (
            <FormattedMessage
              id="invitation.invitedYou"
              defaultMessage="{inviter} ({email}) invited you as {role, select, Owner {an} Admin {an} other {a}} <b>{role}</b>."
              values={{
                inviter: inviter.name,
                email: inviter.email,
                role: role.name,
                b: bold,
              }}
            />
          ) : (
            <FormattedMessage
              id="invitation.invitedYouOrganization"
              defaultMessage="{organization} invited you as {role, select, Owner {an} Admin {an} other {a}} <b>{role}</b>."
              values={{ organization, role: role.name, b: bold }}
            />
          )}
        </Typography>
        {role.description && (
          <Typography color="text.secondary">{role.description}</Typography>
        )}
      </Box>
      {note && (
        <Paper
          variant="outlined"
          sx={{ p: 1.5, bgcolor: 'background.default', borderStyle: 'none' }}
        >
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontWeight: 600 }}
          >
            {intl.formatMessage(
              { id: 'invitation.noteFrom', defaultMessage: 'From {inviter}' },
              { inviter: inviter?.name ?? organization },
            )}
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-line' }}>{note}</Typography>
        </Paper>
      )}
    </>
  );
}

/** The link's last day, and what happens if they do nothing. */
function Until({ lastDay }: { lastDay: string }) {
  const intl = useIntl();
  return (
    <Typography variant="body2" color="text.secondary">
      {intl.formatMessage(
        {
          id: 'invitation.until',
          defaultMessage:
            'This invitation works until {date}. Not expecting it? Close this page: nothing happens unless you join.',
        },
        { date: lastDay },
      )}
    </Typography>
  );
}

function joinLabel(intl: ReturnType<typeof useIntl>, organization: string) {
  return intl.formatMessage(
    { id: 'invitation.join', defaultMessage: 'Join {organization}' },
    { organization },
  );
}

/**
 * The account already belongs to another organization: one person in two
 * is deferred (ADR-077), and only its owner is told why.
 */
function OtherOrganization({ invitation }: { invitation: InvitationPreview }) {
  const intl = useIntl();
  return (
    <InvitationLayout
      title={intl.formatMessage({
        id: 'invitation.otherOrganization.title',
        defaultMessage: 'You can’t join with this account yet',
      })}
    >
      <Typography color="text.secondary">
        {intl.formatMessage(
          {
            id: 'invitation.otherOrganization.body',
            defaultMessage:
              '{email} already belongs to another organization, and for now an account can belong to only one.',
          },
          { email: invitation.email },
        )}
      </Typography>
      <Typography color="text.secondary">
        {invitation.inviter
          ? intl.formatMessage(
              {
                id: 'invitation.otherOrganization.next',
                defaultMessage:
                  'Tell {inviter}, who invited you. Or, if you’re done with the other organization, leave it from your account page, then open this link again before {date}.',
              },
              {
                inviter: invitation.inviter.name,
                date: formatDayLong(invitation.lastDay),
              },
            )
          : intl.formatMessage(
              {
                id: 'invitation.otherOrganization.nextOrganization',
                defaultMessage:
                  'Tell someone at {organization}. Or, if you’re done with the other organization, leave it from your account page, then open this link again before {date}.',
              },
              {
                organization: invitation.organization.name,
                date: formatDayLong(invitation.lastDay),
              },
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
