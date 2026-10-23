import {
  Alert,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { SettingsSection } from '../components/settings-section';
import { LearnMore } from '../help/learn-more';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { rem } from '../theme/rem';

type Scope = 'unticked' | 'everyone';
const MINUTES = [15, 30, 60, 240] as const;

/**
 * Sign out after inactivity (ADR-065), the organization's policy for
 * computers several people share. Off keeps today's sessions; a time only
 * ever shortens one, for sign-ins without Keep me signed in or for
 * everyone. The server holds it; the page warns a minute before.
 */
export function IdleSignOutForm({
  minutes,
  scope,
  onSaved,
}: {
  minutes: number | null;
  scope: Scope;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [after, setAfter] = useState(
    minutes === null ? 'off' : String(minutes),
  );
  const [appliesTo, setAppliesTo] = useState<Scope>(scope);
  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.security.saved',
      defaultMessage: 'Sign-out setting saved',
    }),
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({
          idleSignOutMinutes: after === 'off' ? null : Number(after),
          idleSignOutScope: appliesTo,
        }),
      }),
    );
  }

  const label = (value: number) =>
    value < 60
      ? intl.formatMessage(
          {
            id: 'settings.security.minutes',
            defaultMessage: '{count, plural, one {# minute} other {# minutes}}',
          },
          { count: value },
        )
      : intl.formatMessage(
          {
            id: 'settings.security.hours',
            defaultMessage: '{count, plural, one {# hour} other {# hours}}',
          },
          { count: value / 60 },
        );

  return (
    <SettingsSection
      title={intl.formatMessage({
        id: 'settings.security.title',
        defaultMessage: 'Sign out after inactivity',
      })}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={false}
      saveLabel={intl.formatMessage({
        id: 'common.save',
        defaultMessage: 'Save',
      })}
    >
      <Typography sx={{ color: 'text.secondary' }}>
        {intl.formatMessage({
          id: 'settings.security.intro',
          defaultMessage:
            'For computers several people share. Off keeps today’s sessions: seven days idle.',
        })}
      </Typography>

      <TextField
        select
        id="idle-sign-out-after"
        label={intl.formatMessage({
          id: 'settings.security.after',
          defaultMessage: 'After',
        })}
        value={after}
        onChange={(event) => setAfter(event.target.value)}
        helperText={
          <LearnMore
            target={{ guide: 'organization', section: 'idle-sign-out' }}
            variant="beside"
            after={intl.formatMessage({
              id: 'settings.security.afterHelp',
              defaultMessage: 'Only real use counts as activity.',
            })}
          />
        }
        sx={{ maxWidth: rem(240) }}
      >
        <MenuItem value="off">
          {intl.formatMessage({
            id: 'settings.security.off',
            defaultMessage: 'Off',
          })}
        </MenuItem>
        {MINUTES.map((value) => (
          <MenuItem key={value} value={String(value)}>
            {label(value)}
          </MenuItem>
        ))}
      </TextField>

      <Stack spacing={0.5}>
        <Typography variant="subtitle2" component="h3" id="idle-sign-out-scope">
          {intl.formatMessage({
            id: 'settings.security.appliesTo',
            defaultMessage: 'Applies to',
          })}
        </Typography>
        <RadioGroup
          aria-labelledby="idle-sign-out-scope"
          value={appliesTo}
          onChange={(event) => setAppliesTo(event.target.value as Scope)}
        >
          <FormControlLabel
            value="unticked"
            control={<Radio />}
            disabled={after === 'off'}
            label={intl.formatMessage({
              id: 'settings.security.unticked',
              defaultMessage:
                'Only sign-ins without “Keep me signed in”: the shared computers, where people untick it',
            })}
          />
          <FormControlLabel
            value="everyone"
            control={<Radio />}
            disabled={after === 'off'}
            label={intl.formatMessage({
              id: 'settings.security.everyone',
              defaultMessage:
                'Everyone: for rules that ask every session to end after inactivity',
            })}
          />
        </RadioGroup>
      </Stack>

      <Alert severity="info">
        {intl.formatMessage({
          id: 'settings.security.note',
          defaultMessage:
            'A minute before, people see a warning with “Stay signed in”. It can only shorten a session, never lengthen it.',
        })}
      </Alert>
    </SettingsSection>
  );
}
