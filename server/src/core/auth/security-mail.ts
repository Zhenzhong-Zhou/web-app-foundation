import { UAParser } from 'ua-parser-js';

import type { AccountEventAction } from '../../database/schema';
import { escapeHtml } from '../../shared/mail/escape-html';
import type { Mail } from '../../shared/mail/mail.service';

interface SecurityMailContext {
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
  Record<AccountEventAction, { subject: string; happened: string }>
> = {
  'session.created': {
    subject: 'New sign-in to your account',
    happened:
      'Your account was signed in to from a browser it has not used before.',
  },
  'account.password_changed': {
    subject: 'Your password was changed',
    happened: 'The password for your account was changed.',
  },
  'account.password_reset': {
    subject: 'Your password was reset',
    happened:
      'The password for your account was reset from a link sent to this address, and every device was signed out.',
  },
};

/** "Chrome on macOS", or as much of it as the user agent gives up. */
function describeBrowser(userAgent?: string): string {
  if (!userAgent) return 'Unknown browser';

  const { browser, os } = new UAParser(userAgent).getResult();

  if (browser.name && os.name) return `${browser.name} on ${os.name}`;
  return browser.name ?? os.name ?? 'Unknown browser';
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

  const details = [
    ['When', context.at.toUTCString()],
    ['Browser', describeBrowser(context.userAgent)],
    ['IP address', context.ip ?? 'Unknown'],
  ];

  const reset = `${context.clientUrl}/forgot-password`;
  const sessions = `${context.clientUrl}/account/sessions`;

  const text = [
    `Hi ${context.name},`,
    '',
    copy.happened,
    '',
    ...details.map(([label, value]) => `${label}: ${value}`),
    '',
    'If this was you, there is nothing to do.',
    '',
    `If it was not, reset your password now — that signs out every device: ${reset}`,
    `Then check which devices are signed in: ${sessions}`,
    '',
    'We will never ask for your password by email.',
  ].join('\n');

  const cell = 'padding:4px 12px 4px 0';

  const html = [
    `<p>Hi ${escapeHtml(context.name)},</p>`,
    `<p>${copy.happened}</p>`,
    '<table style="border-collapse:collapse">',
    ...details.map(
      ([label, value]) =>
        `<tr><td style="${cell};color:#666">${label}</td><td style="${cell}">${escapeHtml(value)}</td></tr>`,
    ),
    '</table>',
    '<p>If this was you, there is nothing to do.</p>',
    `<p>If it was not, <a href="${reset}">reset your password</a> now — that signs out every device. Then <a href="${sessions}">check which devices are signed in</a>.</p>`,
    '<p style="color:#666">We will never ask for your password by email.</p>',
  ].join('\n');

  return { to: context.to, subject: copy.subject, text, html };
}
