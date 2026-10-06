import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { useAuth } from '../auth/use-auth';
import { LanguageSelect } from '../components/language-select';
import { api, messageFor } from '../lib/api';
import { NAME_MAX_LENGTH } from '../lib/validation';

export function ProfileForm() {
  const intl = useIntl();
  const { session, refresh } = useAuth();

  const [name, setName] = useState(session?.user.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);

    try {
      await api('/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });

      // The header renders the name from session, so it would otherwise stay
      // stale until the next page load.
      await refresh();
      setSaved(true);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={2}>
      <Typography variant="h6" component="h2">
        {intl.formatMessage({
          id: 'account.profile.title',
          defaultMessage: 'Profile',
        })}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}
      {saved && (
        <Alert severity="success">
          {intl.formatMessage({
            id: 'account.profile.saved',
            defaultMessage: 'Saved.',
          })}
        </Alert>
      )}

      <TextField
        id="name"
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

      {/* Read-only. Changing an address is a flow, not a field: the new one
          has to be verified before it takes effect, or a typo locks the
          account out. The endpoint rejects an email in this body. */}
      <TextField
        label={intl.formatMessage({
          id: 'auth.field.email',
          defaultMessage: 'Email',
        })}
        value={session?.user.email ?? ''}
        disabled
        fullWidth
        helperText={intl.formatMessage({
          id: 'account.profile.emailFixed',
          defaultMessage: "Changing your email address isn't available yet.",
        })}
      />

      {/* The same picker as the account menu's (ADR-054): it saves itself
          the moment it changes, so it sits outside what Save submits. */}
      <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'language.label',
            defaultMessage: 'Language',
          })}
        </Typography>
        <LanguageSelect />
      </Stack>

      <Button
        type="submit"
        disabled={submitting || name === session?.user.name}
        sx={{ alignSelf: 'flex-start' }}
      >
        {submitting
          ? intl.formatMessage({
              id: 'common.saving',
              defaultMessage: 'Saving…',
            })
          : intl.formatMessage({ id: 'common.save', defaultMessage: 'Save' })}
      </Button>
    </Stack>
  );
}
