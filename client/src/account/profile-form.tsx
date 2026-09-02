import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { useAuth } from '../auth/use-auth';
import { ApiError, api } from '../lib/api';
import { NAME_MAX_LENGTH } from '../lib/validation';

export function ProfileForm() {
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
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not reach the server.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={2}>
      <Typography variant="h6" component="h2">
        Profile
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}
      {saved && <Alert severity="success">Saved.</Alert>}

      <TextField
        id="name"
        label="Your name"
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
        label="Email"
        value={session?.user.email ?? ''}
        disabled
        fullWidth
        helperText="Changing your email address isn't available yet."
      />

      <Button
        type="submit"
        disabled={submitting || name === session?.user.name}
        sx={{ alignSelf: 'flex-start' }}
      >
        {submitting ? 'Saving…' : 'Save'}
      </Button>
    </Stack>
  );
}
