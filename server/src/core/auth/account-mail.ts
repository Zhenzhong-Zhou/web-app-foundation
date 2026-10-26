import type { Locale } from '../../common/locales';
import { t, type Translatable, translate } from '../../i18n/translate';
import { escapeHtml } from '../../shared/mail/escape-html';
import type { Mail } from '../../shared/mail/mail.service';

/** Who the email goes to, in their language (ADR-054), and its token. */
export interface AccountMailContext {
  locale: Locale;
  to: string;
  name: string;
  clientUrl: string;
  token: string;
}

/** The link to confirm an address, sent on registration and on a resend. */
export function verificationMail(context: AccountMailContext): Mail {
  const link = `${context.clientUrl}/verify-email?token=${context.token}`;

  // In the recipient's language (ADR-054); the English is unchanged.
  const say = (message: Translatable) => translate(message, context.locale);
  const hi = (who: string) =>
    say(t({ id: 'mail.hi', defaultMessage: 'Hi {name},' }, { name: who }));
  const confirm = say(
    t({
      id: 'mail.verify.confirm',
      defaultMessage: 'Confirm your email address',
    }),
  );
  const expires = say(
    t({
      id: 'mail.verify.expires',
      defaultMessage:
        'The link expires in 24 hours. If you did not sign up, ignore this message.',
    }),
  );

  return {
    to: context.to,
    subject: confirm,
    text: `${hi(context.name)}\n\n${say(t({ id: 'mail.verify.lead', defaultMessage: 'Confirm your email address:' }))}\n${link}\n\n${expires}`,
    html: `<p>${hi(escapeHtml(context.name))}</p><p><a href="${link}">${confirm}</a></p><p>${expires}</p>`,
  };
}

/** The link to choose a new password, from the forgot-password page. */
export function passwordResetMail(context: AccountMailContext): Mail {
  const link = `${context.clientUrl}/reset-password?token=${context.token}`;

  const say = (message: Translatable) => translate(message, context.locale);
  const hi = (who: string) =>
    say(t({ id: 'mail.hi', defaultMessage: 'Hi {name},' }, { name: who }));
  const reset = say(
    t({ id: 'mail.reset.action', defaultMessage: 'Reset your password' }),
  );
  const expires = say(
    t({
      id: 'mail.reset.expires',
      defaultMessage:
        'The link expires in one hour and can be used once. If you did not request this, ignore this message — your password has not changed.',
    }),
  );

  return {
    to: context.to,
    subject: reset,
    text: `${hi(context.name)}\n\n${say(t({ id: 'mail.reset.lead', defaultMessage: 'Reset your password:' }))}\n${link}\n\n${expires}`,
    html: `<p>${hi(escapeHtml(context.name))}</p><p><a href="${link}">${reset}</a></p><p>${expires}</p>`,
  };
}
