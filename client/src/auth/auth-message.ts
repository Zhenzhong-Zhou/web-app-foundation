import { intl } from '../i18n/intl';
import { ApiError, messageFor } from '../lib/api';

/**
 * What a failed sign-in or registration says.
 *
 * The server's own message otherwise, as everywhere (messageFor). It answers
 * identically for a wrong password and an unknown address (ADR-011), and
 * showing its words as-is keeps it that way: a client-side branch on "user
 * not found" would hand back what login refused to.
 *
 * A 429 gets words of its own, with the wait the throttler states. The
 * windows differ by route — fifteen minutes for login, keyed on email and IP,
 * one for registration — so "shortly" would be wrong for one of them, and
 * the header is the honest answer for both.
 *
 * Forgot-password does not use this. It must not repeat the server at all,
 * so it keeps its own fixed wording.
 */
export function authMessageFor(caught: unknown): string {
  if (caught instanceof ApiError && caught.status === 429) {
    return caught.retryAfterSeconds
      ? intl().formatMessage(
          {
            id: 'auth.tooManyAttemptsFor',
            defaultMessage:
              'Too many attempts. Try again in {seconds, plural, one {# second} other {# seconds}}.',
          },
          { seconds: caught.retryAfterSeconds },
        )
      : intl().formatMessage({
          id: 'auth.tooManyAttempts',
          defaultMessage: 'Too many attempts. Try again later.',
        });
  }

  return messageFor(caught);
}
