import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type SubmitEvent,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Link as RouterLink,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import type { InvitationPreview, InvitationRead } from '../api/types.gen';
import { PasswordField } from '../components/password-field';
import { useLanguage } from '../i18n/use-language';
import { api, ApiError, hasCode, messageFor } from '../lib/api';
import { formatDayLong } from '../lib/format';
import type { Locale } from '../lib/locales';
import { KEEP_SIGNED_IN } from '../lib/session-keys';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import {
  looksLikeToken,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../lib/validation';
import { AuthLayout } from './auth-layout';
import { authMessageFor } from './auth-message';
import { useAuth } from './use-auth';

const bold = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

/** What came of a change of language, for whichever page is showing. */
const LanguageNotice = createContext<ReactNode>(null);

/** The signed-out frame, with what came of a change of language. */
function InvitationLayout(props: ComponentProps<typeof AuthLayout>) {
  return <AuthLayout notice={useContext(LanguageNotice)} {...props} />;
}

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
 */
export function InvitationPage() {
  const intl = useIntl();
  const [languageKept, setLanguageKept] = useState(false);

  return (
    <LanguageNotice.Provider
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
    </LanguageNotice.Provider>
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
  const [read, setRead] = useState<InvitationPreview | null | undefined>(
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
      .then(({ invitation }) => {
        if (ignore) return;
        readIn.current = locale;
        onLanguageKept(false);
        setRead(invitation);
        // In the invitation's language to start with, once: a choice made
        // on the page after that stays. Signed in, the account's own.
        if (invitation && !started.current) {
          started.current = true;
          if (!signedIn && invitation.locale !== locale) {
            setLocale(invitation.locale);
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
  if (read === null) return <Ended />;

  const invitation = read;
  const organization = invitation.organization.name;
  const lastDay = formatDayLong(invitation.lastDay);

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
          invitation={invitation}
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
        <KeepAccount
          invitation={invitation}
          deletionDay={session.user.deletionScheduledAt}
          onKept={refresh}
        />
      );
    }
    return (
      <JoinSignedIn
        token={token!}
        invitation={invitation}
        email={session.user.email}
        refusal={carried}
        onJoined={joined}
        onRefused={refused}
        onSignedOut={refresh}
      />
    );
  }

  const header = <InvitationHeader invitation={invitation} />;
  const until = <Until lastDay={lastDay} />;

  return invitation.hasAccount ? (
    <SignInToJoin
      token={token!}
      invitation={invitation}
      header={header}
      until={until}
      onJoined={joined}
      onRefused={refused}
      onSignedInAnyway={signedInAnyway}
    />
  ) : (
    <NewAccount
      token={token!}
      invitation={invitation}
      locale={locale}
      header={header}
      until={until}
      onJoined={joined}
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

/** Keep me signed in, as at sign-in (ADR-065), remembered by this browser. */
function KeepSignedIn({
  checked,
  onChange,
  long,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  long: boolean;
}) {
  const intl = useIntl();
  return (
    <FormControlLabel
      control={
        <Checkbox
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
      }
      label={
        <span>
          {intl.formatMessage({
            id: 'auth.keepSignedIn',
            defaultMessage: 'Keep me signed in',
          })}
          <Typography
            component="span"
            variant="body2"
            color="text.secondary"
            sx={{ display: 'block' }}
          >
            {long
              ? intl.formatMessage({
                  id: 'auth.keepSignedInHint',
                  defaultMessage:
                    'Untick on a computer others use: you’re signed out when the browser closes, or after two hours idle.',
                })
              : intl.formatMessage({
                  id: 'invitation.keepSignedInShort',
                  defaultMessage: 'Untick on a computer others use.',
                })}
          </Typography>
        </span>
      }
      sx={{ alignItems: 'flex-start', '& .MuiCheckbox-root': { pt: 0.5 } }}
    />
  );
}

function useKeepSignedIn() {
  return useState(
    () => window.localStorage.getItem(KEEP_SIGNED_IN) !== 'false',
  );
}

function joinLabel(intl: ReturnType<typeof useIntl>, organization: string) {
  return intl.formatMessage(
    { id: 'invitation.join', defaultMessage: 'Join {organization}' },
    { organization },
  );
}

/** No account at the address: the person names themselves and joins. */
function NewAccount({
  token,
  invitation,
  locale,
  header,
  until,
  onJoined,
  onRefused,
}: {
  token: string;
  invitation: InvitationPreview;
  locale: string;
  header: ReactNode;
  until: ReactNode;
  onJoined: () => Promise<void>;
  onRefused: (caught: unknown) => Promise<string | null>;
}) {
  const intl = useIntl();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useKeepSignedIn();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const organization = invitation.organization.name;

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // In the language the page is in, which the account takes (ADR-077).
      await api('/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token, name, password, locale, keepSignedIn }),
      });
      window.localStorage.setItem(KEEP_SIGNED_IN, String(keepSignedIn));
      await onJoined();
    } catch (caught) {
      setError(await onRefused(caught));
      setSubmitting(false);
    }
  }

  return (
    <InvitationLayout
      title={joinLabel(intl, organization)}
      above={<OrganizationMark invitation={invitation} />}
      onSubmit={handleSubmit}
    >
      {header}
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        id="invitation-email"
        label={intl.formatMessage({
          id: 'auth.field.email',
          defaultMessage: 'Email',
        })}
        type="email"
        // The address the new password is for, to a password manager.
        autoComplete="username"
        value={invitation.email}
        fullWidth
        helperText={intl.formatMessage({
          id: 'invitation.emailFixed',
          defaultMessage:
            'The invitation is for this address. You’ll sign in with it.',
        })}
        slotProps={{ htmlInput: { readOnly: true } }}
      />
      <TextField
        id="invitation-name"
        label={intl.formatMessage({
          id: 'auth.register.yourName',
          defaultMessage: 'Your name',
        })}
        autoComplete="name"
        required
        fullWidth
        value={name}
        onChange={(event) => setName(event.target.value)}
        slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
      />
      <PasswordField
        id="invitation-password"
        label={intl.formatMessage({
          id: 'invitation.choosePassword',
          defaultMessage: 'Choose a password',
        })}
        autoComplete="new-password"
        required
        fullWidth
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        helperText={intl.formatMessage(
          {
            id: 'invitation.passwordHelp',
            defaultMessage:
              'At least {count} characters. Only you will know it.',
          },
          { count: PASSWORD_MIN_LENGTH },
        )}
        slotProps={{
          htmlInput: {
            minLength: PASSWORD_MIN_LENGTH,
            maxLength: PASSWORD_MAX_LENGTH,
          },
        }}
      />
      <KeepSignedIn checked={keepSignedIn} onChange={setKeepSignedIn} long />
      <Button type="submit" variant="contained" disabled={submitting}>
        {joinLabel(intl, organization)}
      </Button>
      {until}
    </InvitationLayout>
  );
}

/**
 * An account at the address, in no organization: the person signs in
 * through sign-in itself, its limits and its new sign-in email and all,
 * then joins (ADR-077).
 */
function SignInToJoin({
  token,
  invitation,
  header,
  until,
  onJoined,
  onRefused,
  onSignedInAnyway,
}: {
  token: string;
  invitation: InvitationPreview;
  header: ReactNode;
  until: ReactNode;
  onJoined: () => Promise<void>;
  onRefused: (caught: unknown) => Promise<string | null>;
  /** Signed in, Join refused: the page moves to Join as the account. */
  onSignedInAnyway: (message: string | null) => Promise<void>;
}) {
  const intl = useIntl();
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useKeepSignedIn();
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefusedPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setRefusedPassword(false);
    try {
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: invitation.email,
          password,
          keepSignedIn,
        }),
      });
    } catch (caught) {
      setError(authMessageFor(caught));
      setRefusedPassword(caught instanceof ApiError && caught.status === 401);
      setSubmitting(false);
      return;
    }
    window.localStorage.setItem(KEEP_SIGNED_IN, String(keepSignedIn));
    try {
      await api('/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      await onJoined();
    } catch (caught) {
      const message = await onRefused(caught);
      setError(message);
      setSubmitting(false);
      await onSignedInAnyway(message);
    }
  }

  return (
    <InvitationLayout
      title={joinLabel(intl, invitation.organization.name)}
      above={<OrganizationMark invitation={invitation} />}
      onSubmit={handleSubmit}
    >
      {header}
      <Alert severity="info" role="status">
        {intl.formatMessage({
          id: 'invitation.hasAccount',
          defaultMessage:
            'You already have an account with this address. Sign in with your password to join.',
        })}
      </Alert>
      {error && (
        <Alert id="invitation-sign-in-error" severity="error">
          {error}
        </Alert>
      )}
      <TextField
        id="invitation-email"
        label={intl.formatMessage({
          id: 'auth.field.email',
          defaultMessage: 'Email',
        })}
        type="email"
        autoComplete="username"
        value={invitation.email}
        fullWidth
        slotProps={{ htmlInput: { readOnly: true } }}
      />
      <Box>
        <PasswordField
          id="invitation-password"
          label={intl.formatMessage({
            id: 'auth.field.password',
            defaultMessage: 'Password',
          })}
          autoComplete="current-password"
          required
          fullWidth
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={refused}
          slotProps={{
            htmlInput: {
              maxLength: PASSWORD_MAX_LENGTH,
              'aria-describedby': refused
                ? 'invitation-sign-in-error'
                : undefined,
            },
          }}
        />
        <Link
          component={RouterLink}
          to="/forgot-password"
          variant="body2"
          sx={{ display: 'inline-block', mt: 1 }}
        >
          {intl.formatMessage({
            id: 'auth.login.forgotPassword',
            defaultMessage: 'Forgot your password?',
          })}
        </Link>
      </Box>
      <KeepSignedIn
        checked={keepSignedIn}
        onChange={setKeepSignedIn}
        long={false}
      />
      <Button type="submit" variant="contained" disabled={submitting}>
        {intl.formatMessage({
          id: 'invitation.signInAndJoin',
          defaultMessage: 'Sign in and join',
        })}
      </Button>
      {until}
    </InvitationLayout>
  );
}

/** Signed in as the invitation's address, in no organization: Join. */
function JoinSignedIn({
  token,
  invitation,
  email,
  refusal,
  onJoined,
  onRefused,
  onSignedOut,
}: {
  token: string;
  invitation: InvitationPreview;
  email: string;
  /** A refusal Join met just after signing in on this page. */
  refusal: string | null;
  onJoined: () => Promise<void>;
  onRefused: (caught: unknown) => Promise<string | null>;
  onSignedOut: () => Promise<void>;
}) {
  const intl = useIntl();
  const [error, setError] = useState<string | null>(refusal);
  const [submitting, setSubmitting] = useState(false);
  const organization = invitation.organization.name;

  async function join() {
    setSubmitting(true);
    setError(null);
    try {
      await api('/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      await onJoined();
    } catch (caught) {
      setError(await onRefused(caught));
      setSubmitting(false);
    }
  }

  return (
    <InvitationLayout
      title={joinLabel(intl, organization)}
      above={<OrganizationMark invitation={invitation} />}
    >
      <InvitationHeader invitation={invitation} />
      {error && <Alert severity="error">{error}</Alert>}
      <Typography>
        <FormattedMessage
          id="invitation.signedInAs"
          defaultMessage="You’re signed in as {email}. <signOut>Not you? Sign out</signOut>"
          values={{
            email,
            signOut: (chunks: ReactNode[]) => (
              <SignOutLink onSignedOut={onSignedOut} onFailed={setError}>
                {chunks}
              </SignOutLink>
            ),
          }}
        />
      </Typography>
      <Button
        variant="contained"
        disabled={submitting}
        onClick={() => void join()}
      >
        {joinLabel(intl, organization)}
      </Button>
      <Until lastDay={formatDayLong(invitation.lastDay)} />
    </InvitationLayout>
  );
}

/**
 * "Not you? Sign out", after whose name the page is signed in as. A sign
 * out that fails says so, as the page's own refusal.
 */
function SignOutLink({
  onSignedOut,
  onFailed,
  children,
}: {
  onSignedOut: () => Promise<void>;
  onFailed: (message: string) => void;
  children: ReactNode;
}) {
  return (
    <Link
      component="button"
      type="button"
      variant="body1"
      underline="always"
      onClick={() =>
        void api('/auth/logout', { method: 'POST' }).then(
          onSignedOut,
          (caught: unknown) => onFailed(messageFor(caught)),
        )
      }
      sx={{ verticalAlign: 'baseline' }}
    >
      {children}
    </Link>
  );
}

/** Used, past its days, or revoked: one page for all three (ADR-077). */
function Ended() {
  const intl = useIntl();
  return (
    <InvitationLayout
      title={intl.formatMessage({
        id: 'invitation.ended.title',
        defaultMessage: 'This invitation has ended',
      })}
    >
      <Typography color="text.secondary">
        {intl.formatMessage({
          id: 'invitation.ended.body',
          defaultMessage:
            'It was used already, its 7 days are over, or it was taken back. Ask the person who invited you to send a new one.',
        })}
      </Typography>
      <Typography color="text.secondary">
        {intl.formatMessage({
          id: 'invitation.ended.joined',
          defaultMessage: 'Already joined? Sign in as usual.',
        })}
      </Typography>
      <Box>
        <Button variant="outlined" component={RouterLink} to="/login">
          {intl.formatMessage({
            id: 'invitation.ended.signIn',
            defaultMessage: 'Go to sign in',
          })}
        </Button>
      </Box>
    </InvitationLayout>
  );
}

/** Signed in as another address: the page offers to sign out. */
function OtherAddress({
  invitation,
  signedInAs,
  onSignedOut,
}: {
  invitation: InvitationPreview;
  signedInAs: string;
  onSignedOut: () => Promise<void>;
}) {
  const intl = useIntl();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setSubmitting(true);
    setError(null);
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (caught) {
      setError(messageFor(caught));
      setSubmitting(false);
      return;
    }
    await onSignedOut();
  }

  return (
    <InvitationLayout
      title={intl.formatMessage(
        {
          id: 'invitation.otherAddress.title',
          defaultMessage: 'This invitation is for {email}',
        },
        { email: invitation.email },
      )}
    >
      {error && <Alert severity="error">{error}</Alert>}
      <Typography color="text.secondary">
        {intl.formatMessage(
          {
            id: 'invitation.otherAddress.body',
            defaultMessage:
              'You’re signed in as {email}. Sign out, then open the link again.',
          },
          { email: signedInAs },
        )}
      </Typography>
      <Box>
        <Button
          variant="contained"
          disabled={submitting}
          onClick={() => void signOut()}
        >
          {intl.formatMessage({
            id: 'invitation.signOut',
            defaultMessage: 'Sign out',
          })}
        </Button>
      </Box>
    </InvitationLayout>
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

/**
 * The account is set to be deleted (ADR-069): kept here, the banner's own
 * action, then Join appears. The link stays live meanwhile.
 */
function KeepAccount({
  invitation,
  deletionDay,
  onKept,
}: {
  invitation: InvitationPreview;
  deletionDay: string;
  onKept: () => Promise<void>;
}) {
  const intl = useIntl();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function keep() {
    setSubmitting(true);
    setError(null);
    try {
      await api('/account/deletion', { method: 'DELETE' });
      await onKept();
    } catch (caught) {
      setError(messageFor(caught));
      setSubmitting(false);
    }
  }

  return (
    <InvitationLayout
      title={intl.formatMessage({
        id: 'invitation.keep.title',
        defaultMessage: 'Keep your account to join',
      })}
    >
      {error && <Alert severity="error">{error}</Alert>}
      <Typography color="text.secondary">
        <FormattedMessage
          id="invitation.keep.body"
          defaultMessage="Your account is set to be deleted after <b>{date}</b>. Keep it, then join {organization} as {role, select, Owner {an} Admin {an} other {a}} {role}."
          values={{
            date: formatDayLong(deletionDay),
            organization: invitation.organization.name,
            role: invitation.role.name,
            b: bold,
          }}
        />
      </Typography>
      <Box>
        <Button
          variant="contained"
          disabled={submitting}
          onClick={() => void keep()}
        >
          {intl.formatMessage({
            id: 'account.deletion.keep',
            defaultMessage: 'Keep my account',
          })}
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage(
          {
            id: 'invitation.keep.after',
            defaultMessage:
              'Join appears here once it’s kept. This invitation works until {date}.',
          },
          { date: formatDayLong(invitation.lastDay) },
        )}
      </Typography>
    </InvitationLayout>
  );
}
