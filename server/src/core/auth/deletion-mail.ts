import type { Locale } from '../../common/locales';
import { t, type Translatable, translate } from '../../i18n/translate';
import type { MailContent } from '../../shared/mail/mail-layout';

/** Who the email goes to, in their language (ADR-054). */
export interface DeletionMailContext {
  locale: Locale;
  to: string;
  name: string;
  clientUrl: string;
}

/**
 * The deletion day, YYYY-MM-DD, in the reader's language and unconverted
 * (ADR-052): read and shown in UTC, it comes back the same day, as the
 * banner shows it (ADR-069).
 */
export function dayOf(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/**
 * One email from paragraphs: the greeting, the paragraphs, then the link,
 * the account page unless another is given, written out as its own words
 * (ADR-083). A notice informs; what it mentions is done in the app.
 */
export function compose(
  context: DeletionMailContext,
  subject: Translatable,
  paragraphs: Translatable[],
  path = '/account',
): MailContent {
  const say = (message: Translatable) => translate(message, context.locale);

  return {
    to: context.to,
    subject: say(subject),
    locale: context.locale,
    blocks: [
      { kind: 'greeting', name: context.name },
      ...paragraphs.map(
        (paragraph) => ({ kind: 'paragraph', text: say(paragraph) }) as const,
      ),
      { kind: 'link', href: `${context.clientUrl}${path}` },
    ],
  };
}

/**
 * The deletion is scheduled: after which day, and how to keep the
 * account. After, not on: it completes once the day has ended everywhere.
 */
export function deletionScheduledMail(
  context: DeletionMailContext,
  day: string,
): MailContent {
  const date = dayOf(day, context.locale);
  return compose(
    context,
    t(
      {
        id: 'mail.deletion.scheduled.subject',
        defaultMessage: 'Your account will be deleted after {date}',
      },
      { date },
    ),
    [
      t(
        {
          id: 'mail.deletion.scheduled.when',
          defaultMessage:
            'You asked for your account to be deleted. It will be deleted after {date}, and every other device has been signed out.',
        },
        { date },
      ),
      t({
        id: 'mail.deletion.scheduled.until',
        defaultMessage:
          'Until then you can sign in and work as usual, and download your data from your Account page.',
      }),
      t({
        id: 'mail.deletion.scheduled.cancel',
        defaultMessage:
          'Changed your mind, or did not ask for this? Sign in and press Keep my account in the banner at the top of every page. If you did not ask, change your password too.',
      }),
    ],
  );
}

/** The deletion was cancelled. */
export function deletionCancelledMail(
  context: DeletionMailContext,
): MailContent {
  return compose(
    context,
    t({
      id: 'mail.deletion.cancelled.subject',
      defaultMessage: 'Your account will not be deleted',
    }),
    [
      t({
        id: 'mail.deletion.cancelled.body',
        defaultMessage:
          'The deletion of your account was cancelled, and the account stays as it is.',
      }),
    ],
  );
}

/**
 * The deletion came due and a block now applies, so it was cancelled
 * rather than left waiting (ADR-069): the refusal says what to do.
 */
export function deletionBlockedMail(
  context: DeletionMailContext,
  refusal: Translatable,
): MailContent {
  return compose(
    context,
    t({
      id: 'mail.deletion.blocked.subject',
      defaultMessage: 'Your account could not be deleted',
    }),
    [
      t({
        id: 'mail.deletion.blocked.body',
        defaultMessage:
          'Your account was due to be deleted today, but something changed since you asked:',
      }),
      refusal,
      t({
        id: 'mail.deletion.blocked.again',
        defaultMessage:
          'The deletion is cancelled. Once that is sorted out, you can ask again from your Account page.',
      }),
    ],
  );
}
