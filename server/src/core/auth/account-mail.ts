import { t, type Translatable, translate } from '../../i18n/translate';
import type { MailContent } from '../../shared/mail/mail-layout';
import type { DeletionMailContext } from './deletion-mail';

/** Who the email goes to, in their language (ADR-054), and its token. */
export type AccountMailContext = DeletionMailContext & { token: string };

/** The link to confirm an address, sent on registration and on a resend. */
export function verificationMail(context: AccountMailContext): MailContent {
  return tokenMail(context, '/verify-email', {
    action: t({
      id: 'mail.verify.confirm',
      defaultMessage: 'Confirm your email address',
    }),
    lead: t({
      id: 'mail.verify.lead',
      defaultMessage: 'Confirm your email address:',
    }),
    expires: t({
      id: 'mail.verify.expires',
      defaultMessage:
        'The link expires in 24 hours. If you did not sign up, ignore this message.',
    }),
  });
}

/** The link to choose a new password, from the forgot-password page. */
export function passwordResetMail(context: AccountMailContext): MailContent {
  return tokenMail(context, '/reset-password', {
    action: t({
      id: 'mail.reset.action',
      defaultMessage: 'Reset your password',
    }),
    lead: t({ id: 'mail.reset.lead', defaultMessage: 'Reset your password:' }),
    expires: t({
      id: 'mail.reset.expires',
      defaultMessage:
        'The link expires in one hour and can be used once. If you did not request this, ignore this message — your password has not changed.',
    }),
  });
}

/**
 * An email whose one action is a page opened with the reader's token: the
 * greeting, the action as its subject and its button, which the text part
 * leads with `lead` instead, then when the link expires. In the reader's
 * language (ADR-054); the English is unchanged.
 */
function tokenMail(
  context: AccountMailContext,
  path: string,
  words: { action: Translatable; lead: Translatable; expires: Translatable },
): MailContent {
  const say = (message: Translatable) => translate(message, context.locale);
  const action = say(words.action);
  const link = `${context.clientUrl}${path}?token=${context.token}`;

  return {
    to: context.to,
    subject: action,
    locale: context.locale,
    blocks: [
      { kind: 'greeting', name: context.name },
      {
        kind: 'button',
        label: action,
        href: link,
        plain: `${say(words.lead)}\n${link}`,
      },
      { kind: 'paragraph', text: say(words.expires) },
    ],
  };
}
