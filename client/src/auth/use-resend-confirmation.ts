import { useState } from 'react';

import { api, messageFor } from '../lib/api';

/**
 * Sends the link that confirms the person's address again, as the banner
 * and the welcome's first week offer it (ADR-017, ADR-079). The server
 * answers 202 whether or not a message went out, so there is nothing to
 * report but that it was sent; or why it could not be, such as too many
 * asked for in a row.
 */
export function useResendConfirmation() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resend() {
    setSending(true);
    setError(null);
    void api('/auth/verify-email/resend', { method: 'POST' })
      .then(
        () => setSent(true),
        (caught: unknown) => setError(messageFor(caught)),
      )
      .finally(() => setSending(false));
  }

  return { sent, sending, error, resend };
}
