import { Alert, Button, Stack, Typography } from '@mui/material';
import { type ChangeEvent, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { useAuth } from '../auth/use-auth';
import { PersonAvatar } from '../components/person-avatar';
import { api, messageFor } from '../lib/api';

/**
 * Your photo (ADR-063), beside your profile: added, replaced or removed by
 * you alone. Removing deletes it at once. What colleagues see of you is
 * said on the details card, where it applies.
 */
export function AccountPhoto() {
  const intl = useIntl();
  const { session, refresh } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = session?.user;

  async function change(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await refresh();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setBusy(false);
    }
  }

  function onChoose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    void change(() => api('/account/photo', { method: 'POST', body: form }));
  }

  return (
    <Stack spacing={1.25} sx={{ alignItems: 'center', textAlign: 'center' }}>
      <PersonAvatar
        userId={user?.id ?? null}
        name={user?.name ?? null}
        email={user?.email}
        photoFileId={user?.photoFileId}
        size={112}
      />
      <input
        ref={input}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onChoose}
      />
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          variant={user?.photoFileId ? 'outlined' : 'contained'}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {user?.photoFileId
            ? intl.formatMessage({
                id: 'account.photo.replace',
                defaultMessage: 'Replace',
              })
            : intl.formatMessage({
                id: 'account.photo.add',
                defaultMessage: 'Add a photo',
              })}
        </Button>
        {user?.photoFileId && (
          <Button
            size="small"
            color="error"
            disabled={busy}
            onClick={() =>
              void change(() => api('/account/photo', { method: 'DELETE' }))
            }
          >
            {intl.formatMessage({
              id: 'account.photo.remove',
              defaultMessage: 'Remove',
            })}
          </Button>
        )}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Typography variant="caption" color="text.secondary">
        {intl.formatMessage({
          id: 'account.photo.rules',
          defaultMessage: 'PNG, JPEG or WebP, up to 5 MB.',
        })}
        <br />
        {intl.formatMessage({
          id: 'account.photo.yours',
          defaultMessage: 'Only you can change it.',
        })}
      </Typography>
    </Stack>
  );
}
