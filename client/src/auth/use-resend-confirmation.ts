import { useState } from 'react';

import { api } from '../lib/api';

/**
 * Sends the link that confirms the person's address again, as the banner
 * and the welcome's first week offer it (ADR-017, ADR-079). The server
 * answers 202 whether or not a message went out, so there is nothing to
 * report but that it was sent.
 */
export function useResendConfirmation() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  function resend() {
    setSending(true);
    void api('/auth/verify-email/resend', { method: 'POST' })
      .then(() => setSent(true))
      .finally(() => setSending(false));
  }

  return { sent, sending, resend };
}
