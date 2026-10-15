import { useIntl } from 'react-intl';

/**
 * The way on from a refused password, on a screen that confirms a change
 * with it (#120). Signed in, Forgot your password? is out of reach, so this
 * says how to get to it. Shown with the refusal when it carries
 * password_incorrect; the server's message says only what is wrong.
 *
 * The link is named by the sign-in page's own message, so renaming the
 * link renames it here too.
 */
export function ForgottenPasswordHint() {
  const intl = useIntl();

  return intl.formatMessage(
    {
      id: 'account.password.forgotten',
      defaultMessage:
        'Forgotten it? Sign out, then choose “{link}” on the sign-in page.',
    },
    {
      link: intl.formatMessage({
        id: 'auth.login.forgotPassword',
        defaultMessage: 'Forgot your password?',
      }),
    },
  );
}
