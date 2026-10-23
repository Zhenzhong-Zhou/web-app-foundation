import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Link,
  TextField,
  Typography,
} from '@mui/material';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  type SubmitEvent,
  useContext,
  useState,
} from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { PasswordField } from '../components/password-field';
import { api, ApiError, messageFor } from '../lib/api';
import {
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../lib/validation';
import { AuthLayout } from './auth-layout';
import { authMessageFor } from './auth-message';
import { useKeepSignedIn } from './use-keep-signed-in';

/**
 * The pieces both kinds of invitation page share (ADR-077, ADR-078): the
 * signed-out frame with what came of a change of language, Keep me signed
 * in, Not you? Sign out, the pages for an ended link and for another
 * address, and the forms that accept, which each kind words its own way.
 * Components only, so the page keeps its fast refresh.
 */

/** What a form says: each kind's words, around the same form. */
interface Wording {
  /** The heading, and the button that accepts: Join …, Set up …. */
  title: string;
  /** Above the heading: the organization, or the one to be. */
  above: ReactNode;
  /** Under it: who invites them, and as what. */
  header: ReactNode;
  /** At the foot: the link's last day. */
  until: ReactNode;
}

/** What accepting needs: the kind's own request, its token in it. */
interface Accepting {
  accept: (body: Record<string, unknown>) => Promise<unknown>;
  /** Accepted: the session works in the organization now. */
  onAccepted: () => Promise<void>;
  /** A refusal accepting met, as the page words it, or null for ended. */
  onRefused: (caught: unknown) => Promise<string | null>;
}

/** What came of a change of language, for whichever page is showing. */
const LanguageNotice = createContext<ReactNode>(null);

/** The signed-out frame, with what came of a change of language. */
export function InvitationLayout(props: ComponentProps<typeof AuthLayout>) {
  return <AuthLayout notice={useContext(LanguageNotice)} {...props} />;
}

/** Provides what came of a change of language to the page below it. */
export function LanguageNoticeProvider({
  value,
  children,
}: {
  value: ReactNode;
  children: ReactNode;
}) {
  return (
    <LanguageNotice.Provider value={value}>{children}</LanguageNotice.Provider>
  );
}

/** Keep me signed in, as at sign-in (ADR-065), remembered by this browser. */
export function KeepSignedIn({
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
            sx={{ color: 'text.secondary', display: 'block' }}
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

/**
 * "Not you? Sign out", after whose name the page is signed in as. A sign
 * out that fails says so, as the page's own refusal.
 */
export function SignOutLink({
  onSignedOut,
  onFailed,
  children,
}: {
  onSignedOut: () => void;
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

/**
 * Used, past its days, or revoked: one page for all three (ADR-077), and
 * for an organization invitation's link too (ADR-078).
 */
export function Ended() {
  const intl = useIntl();
  return (
    <InvitationLayout
      title={intl.formatMessage({
        id: 'invitation.ended.title',
        defaultMessage: 'This invitation has ended',
      })}
    >
      <Typography sx={{ color: 'text.secondary' }}>
        {intl.formatMessage({
          id: 'invitation.ended.body',
          defaultMessage:
            'It was used already, its 7 days are over, or it was taken back. Ask the person who invited you to send a new one.',
        })}
      </Typography>
      <Typography sx={{ color: 'text.secondary' }}>
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

/** Signed in as another address: the page offers to sign out. Either kind. */
export function OtherAddress({
  email,
  signedInAs,
  onSignedOut,
}: {
  /** The address the invitation is for. */
  email: string;
  signedInAs: string;
  onSignedOut: () => void;
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
    onSignedOut();
  }

  return (
    <InvitationLayout
      title={intl.formatMessage(
        {
          id: 'invitation.otherAddress.title',
          defaultMessage: 'This invitation is for {email}',
        },
        { email },
      )}
    >
      {error && <Alert severity="error">{error}</Alert>}
      <Typography sx={{ color: 'text.secondary' }}>
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

/** No account at the address: the person names themselves and accepts. */
export function NewAccountForm({
  email,
  locale,
  emailHelp,
  belowEmail,
  accept,
  onAccepted,
  onRefused,
  title,
  above,
  header,
  until,
}: Wording &
  Accepting & {
    email: string;
    /** The page's language, which the account takes (ADR-077). */
    locale: string;
    /** Under the address, which is fixed: what it is for. */
    emailHelp: string;
    /** A line of the kind's own below the address, if any. */
    belowEmail?: ReactNode;
  }) {
  const intl = useIntl();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn, rememberKeepSignedIn] =
    useKeepSignedIn();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await accept({ name, password, locale, keepSignedIn });
      rememberKeepSignedIn();
      await onAccepted();
    } catch (caught) {
      setError(await onRefused(caught));
      setSubmitting(false);
    }
  }

  const emailField = (
    <TextField
      id="invitation-email"
      label={intl.formatMessage({
        id: 'auth.field.email',
        defaultMessage: 'Email',
      })}
      type="email"
      // The address the new password is for, to a password manager.
      autoComplete="username"
      value={email}
      fullWidth
      helperText={emailHelp}
      slotProps={{ htmlInput: { readOnly: true } }}
    />
  );

  return (
    <InvitationLayout title={title} above={above} onSubmit={handleSubmit}>
      {header}
      {error && <Alert severity="error">{error}</Alert>}
      {belowEmail ? (
        <Box>
          {emailField}
          {belowEmail}
        </Box>
      ) : (
        emailField
      )}
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
        {title}
      </Button>
      {until}
    </InvitationLayout>
  );
}

/**
 * An account at the address, in no organization: the person signs in
 * through sign-in itself, its limits and its new sign-in email and all,
 * then accepts (ADR-077).
 */
export function SignInThenAccept({
  email,
  notice,
  submitLabel,
  accept,
  onAccepted,
  onRefused,
  onSignedInAnyway,
  title,
  above,
  header,
  until,
}: Wording &
  Accepting & {
    email: string;
    /** That the address has an account, and what signing in does. */
    notice: string;
    submitLabel: string;
    /** Signed in, then refused: the page moves on as the account. */
    onSignedInAnyway: (message: string | null) => Promise<void>;
  }) {
  const intl = useIntl();
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn, rememberKeepSignedIn] =
    useKeepSignedIn();
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
        body: JSON.stringify({ email, password, keepSignedIn }),
      });
    } catch (caught) {
      setError(authMessageFor(caught));
      setRefusedPassword(caught instanceof ApiError && caught.status === 401);
      setSubmitting(false);
      return;
    }
    rememberKeepSignedIn();
    try {
      await accept({});
      await onAccepted();
    } catch (caught) {
      const message = await onRefused(caught);
      setError(message);
      setSubmitting(false);
      await onSignedInAnyway(message);
    }
  }

  return (
    <InvitationLayout title={title} above={above} onSubmit={handleSubmit}>
      {header}
      <Alert severity="info" role="status">
        {notice}
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
        value={email}
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
        {submitLabel}
      </Button>
      {until}
    </InvitationLayout>
  );
}

/** Signed in as the invitation's address, in no organization: accept. */
export function AcceptSignedIn({
  email,
  refusal,
  onSignedOut,
  accept,
  onAccepted,
  onRefused,
  title,
  above,
  header,
  until,
}: Wording &
  Accepting & {
    /** Whose session it is. */
    email: string;
    /** A refusal met just after signing in on this page. */
    refusal: string | null;
    onSignedOut: () => void;
  }) {
  const [error, setError] = useState<string | null>(refusal);
  const [submitting, setSubmitting] = useState(false);

  async function acceptNow() {
    setSubmitting(true);
    setError(null);
    try {
      await accept({});
      await onAccepted();
    } catch (caught) {
      setError(await onRefused(caught));
      setSubmitting(false);
    }
  }

  return (
    <InvitationLayout title={title} above={above}>
      {header}
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
        onClick={() => void acceptNow()}
      >
        {title}
      </Button>
      {until}
    </InvitationLayout>
  );
}

/**
 * The account is set to be deleted (ADR-069): kept here, the banner's own
 * action, then the page offers to accept. The link stays live meanwhile.
 */
export function KeepAccountFirst({
  title,
  after,
  onKept,
  children,
}: {
  title: string;
  /** What happens once it is kept, and the link's last day. */
  after: string;
  onKept: () => Promise<void>;
  /** When the deletion is due, and what keeping it leads to. */
  children: ReactNode;
}) {
  const intl = useIntl();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Disabled until the page has moved on, not only until the request ends.
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
    <InvitationLayout title={title}>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography sx={{ color: 'text.secondary' }}>{children}</Typography>
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
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {after}
      </Typography>
    </InvitationLayout>
  );
}
