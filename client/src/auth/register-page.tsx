import DomainAddOutlinedIcon from '@mui/icons-material/DomainAddOutlined';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  type ReactNode,
  type SubmitEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { PasswordField } from '../components/password-field';
import { useLanguage } from '../i18n/use-language';
import { api, ApiError, hasCode } from '../lib/api';
import { browserTimeZone } from '../lib/time-zone';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  ORGANIZATION_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../lib/validation';
import { AuthLayout } from './auth-layout';
import { authMessageFor } from './auth-message';
import { useAuth } from './use-auth';
import { useRegistration } from './use-registration';

/**
 * The sign-up page, where registration is open; where organizations come
 * by invitation (ADR-078), an explanation of how to get one instead, so a
 * bookmark or an old link never reaches a dead end.
 */
export function RegisterPage() {
  const [registration, close, refusedAsClosed] = useRegistration();

  if (registration === null) return <Reading />;
  if (registration === 'invitation') {
    return <ByInvitation announce={refusedAsClosed} />;
  }
  return <RegisterForm onClosed={close} />;
}

/**
 * While the setting is read: the signed-out frame, its language and text
 * size already there, and a spinner should the read take a while.
 */
function Reading() {
  const showSpinner = useDelayedFlag(true);
  return (
    <AuthLayout>
      <Stack sx={{ alignItems: 'center', py: 2 }}>
        {showSpinner && <CircularProgress />}
      </Stack>
    </AuthLayout>
  );
}

/**
 * Registration creates user, organization, and Owner membership in one
 * transaction (ADR-004). It was the only onboarding path in V1 (ADR-006);
 * invitations joined it (ADR-077), and a deployment may close it (ADR-078),
 * which is why the organization name is required rather than optional.
 *
 * A duplicate address answers 409 and its message shows as-is. That reveals
 * the address exists, which is the open enumeration decision rather than
 * something to patch here. Nothing in this form should widen it — in
 * particular no availability check on blur, which turns one request into a
 * fast oracle.
 */
function RegisterForm({
  onClosed,
}: {
  /** Closed since the page read the setting: show the explanation. */
  onClosed: () => void;
}) {
  const intl = useIntl();
  const { refresh } = useAuth();
  const { locale } = useLanguage();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    organizationName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // The language chosen on these pages becomes the account's, so the
      // verification email and every screen after it speak it (ADR-054).
      await api('/auth/register', {
        method: 'POST',
        // Where the business is, almost always (ADR-072): the zone this
        // browser is in, which an Owner can change on Profile.
        body: JSON.stringify({ ...form, locale, timeZone: browserTimeZone() }),
      });

      // Registration signs the user in, so the cookie is already set. Read
      // through rather than parsing the 201 body: it carries { user } only.
      await refresh();
      navigate('/', { replace: true });
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        hasCode(caught.code ?? null, 'registration_closed')
      ) {
        onClosed();
        return;
      }
      setError(authMessageFor(caught));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={intl.formatMessage({
        id: 'auth.createAnAccount',
        defaultMessage: 'Create an account',
      })}
      onSubmit={handleSubmit}
    >
      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        id="name"
        label={intl.formatMessage({
          id: 'auth.register.yourName',
          defaultMessage: 'Your name',
        })}
        autoComplete="name"
        required
        fullWidth
        value={form.name}
        onChange={update('name')}
        slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
      />

      <TextField
        id="organizationName"
        label={intl.formatMessage({
          id: 'auth.register.companyName',
          defaultMessage: 'Company name',
        })}
        autoComplete="organization"
        required
        fullWidth
        value={form.organizationName}
        onChange={update('organizationName')}
        slotProps={{ htmlInput: { maxLength: ORGANIZATION_NAME_MAX_LENGTH } }}
      />

      <TextField
        id="email"
        label={intl.formatMessage({
          id: 'auth.field.email',
          defaultMessage: 'Email',
        })}
        type="email"
        autoComplete="username"
        required
        fullWidth
        value={form.email}
        onChange={update('email')}
        slotProps={{ htmlInput: { maxLength: EMAIL_MAX_LENGTH } }}
      />

      <PasswordField
        id="password"
        label={intl.formatMessage({
          id: 'auth.field.password',
          defaultMessage: 'Password',
        })}
        // new-password, not current-password: this is what prompts a manager
        // to offer a generated one (ADR-017).
        autoComplete="new-password"
        required
        fullWidth
        value={form.password}
        onChange={update('password')}
        // Stated, never the authority — anything the browser checks is
        // bypassed by curl, and the 400 is the real control.
        helperText={intl.formatMessage(
          {
            id: 'auth.passwordMinimum',
            defaultMessage: 'At least {count} characters.',
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

      <Button type="submit" variant="contained" disabled={submitting}>
        {submitting
          ? intl.formatMessage({
              id: 'auth.register.creating',
              defaultMessage: 'Creating account…',
            })
          : intl.formatMessage({
              id: 'auth.register.create',
              defaultMessage: 'Create account',
            })}
      </Button>

      <Typography variant="body2">
        <FormattedMessage
          id="auth.register.haveAccount"
          defaultMessage="Already have an account? <link>Sign in</link>"
          values={{
            link: (chunks) => (
              <Link component={RouterLink} to="/login">
                {chunks}
              </Link>
            ),
          }}
        />
      </Typography>
    </AuthLayout>
  );
}

/**
 * Where organizations come by invitation (ADR-078): how to join where you
 * work, how to start a new one, and the way to sign in. No form.
 *
 * Turned into this from the form, refused as closed, its heading takes
 * the focus the button had, so the change is announced (WCAG 2.4.3).
 */
function ByInvitation({ announce }: { announce: boolean }) {
  const intl = useIntl();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (announce) heading.current?.focus();
  }, [announce]);

  return (
    <AuthLayout
      titleRef={heading}
      title={intl.formatMessage({
        id: 'auth.byInvitation.title',
        defaultMessage: 'Accounts here start from an invitation',
      })}
    >
      <Way
        icon={<PersonAddAlt1OutlinedIcon />}
        title={intl.formatMessage({
          id: 'auth.byInvitation.join.title',
          defaultMessage: 'Joining where you work',
        })}
      >
        {intl.formatMessage({
          id: 'auth.byInvitation.join.body',
          defaultMessage:
            'Ask someone in your organization to invite you. You’ll get a link, by email or from them, and choose your own password.',
        })}
      </Way>
      <Way
        icon={<DomainAddOutlinedIcon />}
        title={intl.formatMessage({
          id: 'auth.byInvitation.start.title',
          defaultMessage: 'Starting a new organization',
        })}
      >
        {intl.formatMessage({
          id: 'auth.byInvitation.start.body',
          defaultMessage:
            'Open the link you were sent to set it up. Each link is for one email address and works for 7 days.',
        })}
      </Way>
      <Divider />
      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
      >
        <Typography sx={{ color: 'text.secondary' }}>
          {intl.formatMessage({
            id: 'auth.byInvitation.haveAccount',
            defaultMessage: 'Already have an account?',
          })}
        </Typography>
        <Button variant="outlined" component={RouterLink} to="/login">
          {intl.formatMessage({ id: 'auth.signIn', defaultMessage: 'Sign in' })}
        </Button>
      </Stack>
    </AuthLayout>
  );
}

/** One way in, with its icon. */
function Way({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1.75, alignItems: 'flex-start' }}>
      <Box
        aria-hidden
        sx={{
          width: 40,
          height: 40,
          flex: 'none',
          borderRadius: 2.5,
          bgcolor: 'action.hover',
          color: 'primary.main',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography component="h2" variant="h6">
          {title}
        </Typography>
        <Typography sx={{ color: 'text.secondary' }}>{children}</Typography>
      </Box>
    </Box>
  );
}
