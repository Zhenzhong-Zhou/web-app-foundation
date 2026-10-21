import type { Locale } from '../../common/locales';
import { t, type Translatable, translate } from '../../i18n/translate';
import { escapeHtml } from '../../shared/mail/escape-html';
import type { Mail } from '../../shared/mail/mail.service';
import { zoneLabel } from '../audit/audit-words';
import { dayOf } from '../auth/deletion-mail';

/** An invitation as its email tells it, in the language it carries. */
export interface InvitationMailContext {
  locale: Locale;
  to: string;
  /**
   * Who invited them, while still a member of the organization; null once
   * they have left or deleted their account, and the organization alone
   * is named (ADR-077).
   */
  inviter: { name: string; email: string } | null;
  organizationName: string;
  /** The role in words, in the invitation's language. */
  role: { name: string; description: string | null };
  note: string | null;
  /** The organization's zone, which the last day is in (ADR-072). */
  timeZone: string;
  /** The link's last day, YYYY-MM-DD, in that zone. */
  lastDay: string;
  link: string;
  /** Who sends it, from MAIL_FROM's display name; null for none. */
  appName: string | null;
}

/**
 * The name MAIL_FROM gives its address, `Foundation <no-reply@…>`, or null
 * when it gives none: a footer says nothing rather than an address.
 */
export function appNameOf(mailFrom: string): string | null {
  const match = /^\s*"?([^"<]*?)"?\s*<[^>]*>\s*$/.exec(mailFrom);
  const name = match?.[1].trim();
  return name ? name : null;
}

/**
 * The invitation (ADR-077): who invited them, by name and by address so it
 * can be told from a forgery, or the organization alone once the inviter
 * has gone; to which organization and as what, with what that lets them
 * do; the inviter's note; and the link's last day, named in the
 * organization's zone. The organization is named in words, never by its
 * logo: mail apps block an inline image. Everything a person typed is
 * escaped in the HTML part, as every sentence is.
 */
export function invitationMail(context: InvitationMailContext): Mail {
  const say = (message: Translatable) => translate(message, context.locale);
  const organization = context.organizationName;
  // Who the note and the invitation are from: the inviter, or, once they
  // have gone, the organization.
  const inviter = context.inviter?.name ?? organization;

  const heading = say(
    t(
      { id: 'mail.invitation.heading', defaultMessage: 'Join {organization}' },
      { organization },
    ),
  );
  const lead = say(
    context.inviter
      ? t(
          {
            id: 'mail.invitation.lead',
            // The article from the role's name: an Owner, an Admin, a Viewer.
            defaultMessage:
              '{inviter} ({email}) invited you to join as {role, select, Owner {an} Admin {an} other {a}} {role}.',
          },
          { inviter, email: context.inviter.email, role: context.role.name },
        )
      : t(
          {
            id: 'mail.invitation.leadOrganization',
            defaultMessage:
              '{organization} invited you to join as {role, select, Owner {an} Admin {an} other {a}} {role}.',
          },
          { organization, role: context.role.name },
        ),
  );
  const from = say(
    t(
      { id: 'mail.invitation.note', defaultMessage: 'From {inviter}' },
      { inviter },
    ),
  );
  const accept = say(
    t({
      id: 'mail.invitation.action',
      defaultMessage: 'Accept the invitation',
    }),
  );
  const expires = say(
    t(
      {
        id: 'mail.invitation.expires',
        defaultMessage:
          'The link works once, until the end of {date}, {zone}. You’ll choose your own password.',
      },
      {
        date: dayOf(context.lastDay, context.locale),
        zone: zoneLabel(context.locale, context.timeZone),
      },
    ),
  );
  const ignore = say(
    t({
      id: 'mail.invitation.ignore',
      defaultMessage:
        'Not expecting this? Ignore it: nothing happens unless you accept.',
    }),
  );
  const fallback = say(
    t(
      {
        id: 'mail.invitation.fallback',
        defaultMessage:
          'If the button doesn’t open, copy this address into your browser: {link}',
      },
      { link: context.link },
    ),
  );
  const footer = say(
    context.appName
      ? t(
          {
            id: 'mail.invitation.sentBy',
            defaultMessage: 'Sent for {organization} by {app}.',
          },
          { organization, app: context.appName },
        )
      : t(
          {
            id: 'mail.invitation.sentFor',
            defaultMessage: 'Sent for {organization}.',
          },
          { organization },
        ),
  );

  const text = [
    heading,
    lead,
    context.role.description,
    context.note && `${from}\n${context.note}`,
    // The link on the line below says what follows: no colon, which each
    // language would write its own way (：in Chinese).
    `${accept}\n${context.link}`,
    expires,
    ignore,
    footer,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n\n');

  const note = context.note
    ? `<blockquote><strong>${escapeHtml(from)}</strong><br>${escapeHtml(context.note).replace(/\r?\n/g, '<br>')}</blockquote>`
    : null;
  const html = [
    `<h1>${escapeHtml(heading)}</h1>`,
    `<p>${escapeHtml(lead)}</p>`,
    context.role.description &&
      `<p>${escapeHtml(context.role.description)}</p>`,
    note,
    `<p><a href="${context.link}">${escapeHtml(accept)}</a></p>`,
    `<p>${escapeHtml(expires)}</p>`,
    `<p>${escapeHtml(ignore)} ${escapeHtml(fallback)}</p>`,
    `<p>${escapeHtml(footer)}</p>`,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n');

  return {
    to: context.to,
    subject: say(
      context.inviter
        ? t(
            {
              id: 'mail.invitation.subject',
              defaultMessage: '{inviter} invited you to join {organization}',
            },
            { inviter, organization },
          )
        : t(
            {
              id: 'mail.invitation.subjectOrganization',
              defaultMessage: 'An invitation to join {organization}',
            },
            { organization },
          ),
    ),
    text,
    html,
  };
}
