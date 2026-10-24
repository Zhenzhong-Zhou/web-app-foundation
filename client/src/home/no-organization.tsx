import DomainAddOutlinedIcon from '@mui/icons-material/DomainAddOutlined';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  type ReactNode,
  type Ref,
  type SubmitEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { useRegistration } from '../auth/use-registration';
import { api, ApiError, hasCode, messageFor } from '../lib/api';
import { browserTimeZone } from '../lib/time-zone';
import { ORGANIZATION_NAME_MAX_LENGTH } from '../lib/validation';
import { greeting } from './greeting';

/**
 * Home for an account with no organization (ADR-078), having left one or
 * seen it closed: what it can do, instead of the cards' refusal. Joining
 * one is by invitation everywhere. Starting one is from an invitation link
 * where organizations come by invitation; where registration is open, it
 * is the form here, which makes the organization with this account as its
 * Owner, in this browser's zone, as registration does (ADR-072).
 */
export function NoOrganization() {
  const intl = useIntl();
  const { session } = useAuth();
  const [registration, close, refusedAsClosed] = useRegistration();
  // Turned into the explanation from the form, refused as closed: the
  // card's heading takes the focus the button had (WCAG 2.4.3).
  const startHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (refusedAsClosed) startHeading.current?.focus();
  }, [refusedAsClosed]);
  const email = session?.user.email ?? '';

  return (
    <Stack spacing={2.5} sx={{ maxWidth: 1080 }}>
      <Typography variant="h4" component="h1">
        {greeting(intl, session?.user.name ?? '')}
      </Typography>
      <Typography sx={{ color: 'text.secondary', mt: -1 }}>
        {intl.formatMessage({
          id: 'home.noOrganization.lead',
          defaultMessage:
            'Your account isn’t in an organization right now, so there’s nothing here to work on yet.',
        })}
      </Typography>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(300px, 100%), 1fr))',
          gap: 2,
          alignItems: 'start',
        }}
      >
        <Way
          icon={<PersonAddAlt1OutlinedIcon />}
          title={intl.formatMessage({
            id: 'home.noOrganization.join.title',
            defaultMessage: 'Join an organization',
          })}
        >
          <Typography>
            {intl.formatMessage(
              {
                id: 'home.noOrganization.join.body',
                defaultMessage:
                  'Ask someone in it to invite {email}. Open their link and sign in: you join with this account and its password.',
              },
              { email },
            )}
          </Typography>
        </Way>

        <Way
          icon={<DomainAddOutlinedIcon />}
          title={intl.formatMessage({
            id: 'home.noOrganization.start.title',
            defaultMessage: 'Start an organization',
          })}
          headingRef={startHeading}
        >
          {registration === 'open' && <StartForm onClosed={close} />}
          {registration === 'invitation' && (
            <Typography>
              {intl.formatMessage({
                id: 'home.noOrganization.start.byInvitation',
                defaultMessage:
                  'New organizations start from an invitation. If you were sent a link to set one up, open it while signed in as this account.',
              })}
            </Typography>
          )}
        </Way>
      </Box>

      <Stack
        direction="row"
        sx={{ alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
      >
        <Typography sx={{ color: 'text.secondary' }}>
          {intl.formatMessage({
            id: 'home.noOrganization.account',
            defaultMessage:
              'Your details, your devices and your own data are on your account page.',
          })}
        </Typography>
        <Button variant="outlined" component={RouterLink} to="/account">
          {intl.formatMessage({
            id: 'invitation.otherOrganization.account',
            defaultMessage: 'Go to your account',
          })}
        </Button>
      </Stack>
    </Stack>
  );
}

/** One way in, a card with its icon. */
function Way({
  icon,
  title,
  headingRef,
  children,
}: {
  icon: ReactNode;
  title: string;
  /** For a card whose heading takes the focus when its body changes. */
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      component="section"
      sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.25 }}
    >
      <Box
        aria-hidden
        sx={{
          width: 40,
          height: 40,
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
      <Typography
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        component="h2"
        variant="h6"
      >
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

/**
 * Start an organization (ADR-078): a name, and this browser's zone. The
 * account becomes its Owner and the session moves to it, so Home becomes
 * the new organization's, with Getting started.
 */
function StartForm({ onClosed }: { onClosed: () => void }) {
  const intl = useIntl();
  const { refresh } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api('/organization', {
        method: 'POST',
        body: JSON.stringify({ name, timeZone: browserTimeZone() }),
      });
      await refresh();
    } catch (caught) {
      // Closed since the page read the setting: say how it works instead.
      if (
        caught instanceof ApiError &&
        hasCode(caught.code ?? null, 'registration_closed')
      ) {
        onClosed();
        return;
      }
      // In an organization or set to be deleted since the session was read
      // (another tab): read it again, so Home or its banner shows the way
      // on the message names, as the invitation page does.
      if (caught instanceof ApiError && caught.status === 409) {
        await refresh();
      }
      setError(messageFor(caught));
      setSubmitting(false);
    }
  }

  return (
    <Stack component="form" spacing={1.5} onSubmit={handleSubmit}>
      <Typography>
        {intl.formatMessage({
          id: 'home.noOrganization.start.body',
          defaultMessage:
            'A new one, with you as its Owner. Your account comes with you; nothing from an earlier organization does.',
        })}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        id="start-organization-name"
        label={intl.formatMessage({
          id: 'settings.org.name.label',
          defaultMessage: 'Organization name',
        })}
        autoComplete="organization"
        required
        fullWidth
        value={name}
        onChange={(event) => setName(event.target.value)}
        helperText={intl.formatMessage({
          id: 'home.noOrganization.start.nameHelp',
          defaultMessage:
            'As it appears on your invoices. You can change it later, in Settings.',
        })}
        slotProps={{ htmlInput: { maxLength: ORGANIZATION_NAME_MAX_LENGTH } }}
      />
      <Box>
        <Button type="submit" variant="contained" disabled={submitting}>
          {intl.formatMessage({
            id: 'home.noOrganization.start.title',
            defaultMessage: 'Start an organization',
          })}
        </Button>
      </Box>
    </Stack>
  );
}
