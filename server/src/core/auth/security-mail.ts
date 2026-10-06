import { UAParser } from 'ua-parser-js';

import type { Locale } from '../../common/locales';
import type { AccountEventAction } from '../../database/schema';
import { t, type Translatable, translate } from '../../i18n/translate';
import { escapeHtml } from '../../shared/mail/escape-html';
import type { Mail } from '../../shared/mail/mail.service';

interface SecurityMailContext {
  /** The recipient's language, else the request's (ADR-054). */
  locale: Locale;
  to: string;
  name: string;
  ip?: string;
  userAgent?: string;
  at: Date;
  clientUrl: string;
}

/**
 * What to say for each emailed event (ADR-037).
 *
 * The subjects are plain and specific on purpose. A security email has to be
 * recognisable at a glance in a list of forty, and one that sounds alarming
 * or vague reads as phishing — which is exactly what people are trained to
 * delete.
 */
const COPY: Partial<
  Record<AccountEventAction, { subject: Translatable; happened: Translatable }>
> = {
  'session.created': {
    subject: t({
      id: 'mail.security.signIn.subject',
      defaultMessage: 'New sign-in to your account',
    }),
    happened: t({
      id: 'mail.security.signIn.happened',
      defaultMessage:
        'Your account was signed in to from a browser it has not used before.',
    }),
  },
  'account.password_changed': {
    subject: t({
      id: 'mail.security.changed.subject',
      defaultMessage: 'Your password was changed',
    }),
    happened: t({
      id: 'mail.security.changed.happened',
      defaultMessage: 'The password for your account was changed.',
    }),
  },
  'account.password_reset': {
    subject: t({
      id: 'mail.security.reset.subject',
      defaultMessage: 'Your password was reset',
    }),
    happened: t({
      id: 'mail.security.reset.happened',
      defaultMessage:
        'The password for your account was reset from a link sent to this address, and every device was signed out.',
    }),
  },
};

/** "Chrome on macOS", or as much of it as the user agent gives up. */
function describeBrowser(
  userAgent: string | undefined,
  locale: Locale,
): string {
  const unknown = translate(
    t({
      id: 'mail.security.unknownBrowser',
      defaultMessage: 'Unknown browser',
    }),
    locale,
  );
  if (!userAgent) return unknown;

  const { browser, os } = new UAParser(userAgent).getResult();

  if (browser.name && os.name) {
    return translate(
      t(
        { id: 'mail.security.browserOn', defaultMessage: '{browser} on {os}' },
        { browser: browser.name, os: os.name },
      ),
      locale,
    );
  }
  return browser.name ?? os.name ?? unknown;
}

/**
 * Null for an event that is not emailed.
 *
 * No token and no one-click action in any link. The two links are ordinary
 * pages the reader could type themselves: a security email that asks you to
 * click something to "secure your account" is the template every phishing
 * kit copies, and the real one should not look like it. Forgot-password is
 * the recovery offered rather than the sessions page, because if the
 * attacker changed the password the owner cannot sign in to reach it — and a
 * reset signs out every device anyway (ADR-011).
 */
export function buildSecurityMail(
  action: AccountEventAction,
  context: SecurityMailContext,
): Mail | null {
  const copy = COPY[action];
  if (!copy) return null;

  // Every sentence in the recipient's language; the English is unchanged.
  const say = (message: Translatable) => translate(message, context.locale);
  const when =
    context.locale === 'en'
      ? context.at.toUTCString()
      : new Intl.DateTimeFormat(context.locale, {
          dateStyle: 'full',
          timeStyle: 'long',
          timeZone: 'UTC',
        }).format(context.at);

  const details = [
    [say(t({ id: 'mail.security.when', defaultMessage: 'When' })), when],
    [
      say(t({ id: 'mail.security.browser', defaultMessage: 'Browser' })),
      describeBrowser(context.userAgent, context.locale),
    ],
    [
      say(t({ id: 'mail.security.ip', defaultMessage: 'IP address' })),
      context.ip ??
        say(t({ id: 'mail.security.unknown', defaultMessage: 'Unknown' })),
    ],
  ];

  const reset = `${context.clientUrl}/forgot-password`;
  const sessions = `${context.clientUrl}/account/sessions`;

  const text = [
    say(
      t(
        { id: 'mail.hi', defaultMessage: 'Hi {name},' },
        { name: context.name },
      ),
    ),
    '',
    say(copy.happened),
    '',
    ...details.map(([label, value]) => `${label}: ${value}`),
    '',
    say(
      t({
        id: 'mail.security.wasYou',
        defaultMessage: 'If this was you, there is nothing to do.',
      }),
    ),
    '',
    say(
      t(
        {
          id: 'mail.security.notYou',
          defaultMessage:
            'If it was not, reset your password now — that signs out every device: {link}',
        },
        { link: reset },
      ),
    ),
    say(
      t(
        {
          id: 'mail.security.checkDevices',
          defaultMessage: 'Then check which devices are signed in: {link}',
        },
        { link: sessions },
      ),
    ),
    '',
    say(
      t({
        id: 'mail.security.neverAsk',
        defaultMessage: 'We will never ask for your password by email.',
      }),
    ),
  ].join('\n');

  const cell = 'padding:4px 12px 4px 0';

  const html = [
    `<p>${say(t({ id: 'mail.hi', defaultMessage: 'Hi {name},' }, { name: escapeHtml(context.name) }))}</p>`,
    `<p>${say(copy.happened)}</p>`,
    '<table style="border-collapse:collapse">',
    ...details.map(
      ([label, value]) =>
        `<tr><td style="${cell};color:#666">${label}</td><td style="${cell}">${escapeHtml(value)}</td></tr>`,
    ),
    '</table>',
    `<p>${say(t({ id: 'mail.security.wasYou', defaultMessage: 'If this was you, there is nothing to do.' }))}</p>`,
    `<p>${say(
      t(
        {
          id: 'mail.security.notYouHtml',
          defaultMessage:
            'If it was not, {resetLink} now — that signs out every device. Then {sessionsLink}.',
        },
        {
          resetLink: `<a href="${reset}">${say(t({ id: 'mail.security.resetLink', defaultMessage: 'reset your password' }))}</a>`,
          sessionsLink: `<a href="${sessions}">${say(t({ id: 'mail.security.sessionsLink', defaultMessage: 'check which devices are signed in' }))}</a>`,
        },
      ),
    )}</p>`,
    `<p style="color:#666">${say(t({ id: 'mail.security.neverAsk', defaultMessage: 'We will never ask for your password by email.' }))}</p>`,
  ].join('\n');

  return { to: context.to, subject: say(copy.subject), text, html };
}
