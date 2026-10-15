import { Link } from '@mui/material';
import { useIntl } from 'react-intl';

import { useAuth } from '../auth/use-auth';
import { api } from '../lib/api';
import { RESET_PASSWORD_EMAIL } from '../lib/session-keys';

/**
 * The way on from a refused password, on a screen that confirms a change
 * with it (#120): one press signs out and opens the reset page, with the
 * person's email filled in. Shown with the refusal when it carries
 * password_incorrect; the server's message says what is wrong.
 *
 * A whole-page load rather than the router: signed out, the app's guard
 * would send this tab to the sign-in page at the same moment, and loading
 * the page leaves nothing of the signed-in app behind. The email waits in
 * this tab's session storage, not the address, so it is in no history or
 * server log, and the reset page takes it once.
 *
 * The link is named by the reset page's own title, so renaming the page
 * renames it here too.
 */
export function ForgottenPasswordHint() {
  const intl = useIntl();
  const { session } = useAuth();

  async function reset() {
    try {
      if (session) {
        window.sessionStorage.setItem(RESET_PASSWORD_EMAIL, session.user.email);
      }
    } catch {
      // Storage refused: the reset page opens with the field empty.
    }
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.assign('/forgot-password');
  }

  return (
    <>
      {intl.formatMessage({
        id: 'account.password.forgottenQuestion',
        defaultMessage: 'Forgotten it?',
      })}{' '}
      <Link
        component="button"
        type="button"
        onClick={() => void reset()}
        sx={{ verticalAlign: 'baseline' }}
      >
        {intl.formatMessage({
          id: 'auth.forgot.title',
          defaultMessage: 'Reset your password',
        })}
      </Link>
    </>
  );
}
