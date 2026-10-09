import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { useAuth } from '../auth/use-auth';
import { api, messageFor } from '../lib/api';

interface Details {
  jobTitle: string | null;
  department: string | null;
  location: string | null;
  workPhone: string | null;
  extension: string | null;
}

const FIELDS = [
  'jobTitle',
  'department',
  'location',
  'workPhone',
  'extension',
] as const;

/**
 * Your details at this organization (ADR-063): shown to colleagues on the
 * People page, each optional, set only by you. An emptied field is cleared.
 */
export function WorkDetailsForm() {
  const intl = useIntl();
  const { session } = useAuth();
  const [values, setValues] = useState<Record<keyof Details, string> | null>(
    null,
  );
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    void api<Details>('/account/details')
      .then((details) => {
        if (ignore) return;
        setValues(
          Object.fromEntries(
            FIELDS.map((field) => [field, details[field] ?? '']),
          ) as Record<keyof Details, string>,
        );
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });
    return () => {
      ignore = true;
    };
  }, []);

  const labels: Record<keyof Details, string> = {
    jobTitle: intl.formatMessage({
      id: 'account.details.jobTitle',
      defaultMessage: 'Job title',
    }),
    department: intl.formatMessage({
      id: 'people.department',
      defaultMessage: 'Department',
    }),
    location: intl.formatMessage({
      id: 'people.location',
      defaultMessage: 'Location',
    }),
    workPhone: intl.formatMessage({
      id: 'people.workPhone',
      defaultMessage: 'Work phone',
    }),
    extension: intl.formatMessage({
      id: 'account.details.extension',
      defaultMessage: 'Extension',
    }),
  };

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!values) return;
    setSubmitting(true);
    setSaved(false);
    setError(null);
    try {
      await api('/account/details', {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      setSaved(true);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  if (!session?.organization) return null;

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={2}>
      <Box>
        <Typography variant="h6" component="h2">
          {intl.formatMessage(
            {
              id: 'account.details.title',
              defaultMessage: 'Your details at {organization}',
            },
            { organization: session.organization.name },
          )}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'account.details.intro',
            defaultMessage:
              'Shown to the people you work with, on the People page. Each is optional.',
          })}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'account.details.seen',
            defaultMessage:
              'Colleagues see roughly when you were last active; those who may read the history see the exact time and your recent work.',
          })}
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {saved && (
        <Alert severity="success">
          {intl.formatMessage({
            id: 'account.profile.saved',
            defaultMessage: 'Saved.',
          })}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(3, minmax(0, 1fr))',
          },
          gap: 2,
        }}
      >
        {FIELDS.map((field) => (
          <TextField
            key={field}
            id={`details-${field}`}
            label={labels[field]}
            value={values?.[field] ?? ''}
            disabled={!values}
            onChange={(event) =>
              setValues((current) =>
                current ? { ...current, [field]: event.target.value } : current,
              )
            }
            slotProps={{
              htmlInput: {
                maxLength:
                  field === 'extension' ? 10 : field === 'workPhone' ? 40 : 100,
                ...(field === 'workPhone' || field === 'extension'
                  ? { inputMode: 'tel' }
                  : {}),
              },
            }}
          />
        ))}
      </Box>

      <Box>
        <Button
          type="submit"
          variant="contained"
          disabled={!values || submitting}
        >
          {intl.formatMessage({
            id: 'account.details.save',
            defaultMessage: 'Save details',
          })}
        </Button>
      </Box>
    </Stack>
  );
}
