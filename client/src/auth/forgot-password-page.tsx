import { Alert, Button, Link, TextField, Typography } from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { api } from '../lib/api';
import { useFailureWords } from '../lib/use-failure-words';
import { EMAIL_MAX_LENGTH } from '../lib/validation';
import { AuthLayout } from './auth-layout';
import { forgotMessageFor } from './auth-message';

/**
 * Answers identically whether or not the address exists (ADR-017), so the UI
 * must too: one confirmation, and nowhere any wording like "we couldn't find
 * that email". Saying it here would hand back exactly what the server refused.
 */
export function ForgotPasswordPage() {
  const intl = useIntl();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  // A failure as it came, worded as the page renders (ADR-081).
  const [error, setError] = useState<unknown>(null);
  const errorWords = useFailureWords(error, forgotMessageFor);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (caught) {
      // A missing account is a 202 like any other, never a failure here.
      setError(caught);
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout
        title={intl.formatMessage({
          id: 'auth.forgot.checkEmail',
          defaultMessage: 'Check your email',
        })}
      >
        <Typography>
          {intl.formatMessage({
            id: 'auth.forgot.sent',
            defaultMessage:
              'If that address has an account, a reset link is on its way.',
          })}
        </Typography>
        <Link component={RouterLink} to="/login" variant="body2">
          {intl.formatMessage({
            id: 'auth.backToSignIn',
            defaultMessage: 'Back to sign in',
          })}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={intl.formatMessage({
        id: 'auth.forgot.title',
        defaultMessage: 'Reset your password',
      })}
      onSubmit={handleSubmit}
    >
      {errorWords && <Alert severity="error">{errorWords}</Alert>}

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
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        slotProps={{ htmlInput: { maxLength: EMAIL_MAX_LENGTH } }}
      />

      <Button type="submit" variant="contained" disabled={submitting}>
        {submitting
          ? intl.formatMessage({
              id: 'auth.forgot.sending',
              defaultMessage: 'Sending…',
            })
          : intl.formatMessage({
              id: 'auth.forgot.send',
              defaultMessage: 'Send reset link',
            })}
      </Button>

      <Link component={RouterLink} to="/login" variant="body2">
        {intl.formatMessage({
          id: 'auth.backToSignIn',
          defaultMessage: 'Back to sign in',
        })}
      </Link>
    </AuthLayout>
  );
}
