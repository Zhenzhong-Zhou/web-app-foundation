import { Box, Link } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { forgotMessageFor } from '../auth/auth-message';
import { useAuth } from '../auth/use-auth';
import { api } from '../lib/api';
import { useFailureWords } from '../lib/use-failure-words';

/**
 * The way on from a refused password, on a screen that confirms a change
 * with it (#120): one press emails the person a reset link, and they stay
 * signed in. Shown with the refusal when it carries password_incorrect;
 * the server's message says what is wrong.
 *
 * Staying signed in loses nothing: finishing the reset signs out every
 * device, this one too, as a reset always has (ADR-017). It is the Forgot
 * your password page's own request, for the person's own address.
 *
 * Once sent, the sentence that says so takes the focus the pressed link
 * had, so a keyboard user is not dropped back at the start of the dialog
 * (WCAG 2.4.3).
 */
export function ForgottenPasswordHint() {
  const intl = useIntl();
  const { session } = useAuth();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  // A failure as it came, worded as the hint renders (ADR-081).
  const [error, setError] = useState<unknown>(null);
  const errorWords = useFailureWords(error, forgotMessageFor);
  const confirmation = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (sent) confirmation.current?.focus();
  }, [sent]);

  if (!session) return null;
  const email = session.user.email;

  async function send() {
    setSending(true);
    setError(null);
    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (caught) {
      // Worded as the Forgot your password page words it.
      setError(caught);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <span ref={confirmation} tabIndex={-1}>
        {intl.formatMessage(
          {
            id: 'account.password.resetSent',
            defaultMessage: 'A reset link is on its way to {email}.',
          },
          { email },
        )}
      </span>
    );
  }

  return (
    <>
      {intl.formatMessage(
        {
          id: 'account.password.forgotten',
          defaultMessage: 'Forgotten it? {link}',
        },
        {
          link: (
            <Link
              key="link"
              component="button"
              type="button"
              disabled={sending}
              onClick={() => void send()}
              sx={{ verticalAlign: 'baseline' }}
            >
              {intl.formatMessage({
                id: 'account.password.emailResetLink',
                defaultMessage: 'Email me a reset link',
              })}
            </Link>
          ),
        },
      )}
      {/* On a line of its own, not joined by a space, which some
          languages do not put between sentences. */}
      {errorWords && (
        <Box component="span" sx={{ display: 'block' }}>
          {errorWords}
        </Box>
      )}
    </>
  );
}
