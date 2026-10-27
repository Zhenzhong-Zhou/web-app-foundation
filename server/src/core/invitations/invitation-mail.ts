import type { Locale } from '../../common/locales';
import { t, type Translatable, translate } from '../../i18n/translate';
import type { Mail } from '../../shared/mail/mail.service';
import { writeMail } from '../../shared/mail/mail-layout';
import { zoneLabel } from '../audit/audit-words';
import { dayOf } from '../auth/deletion-mail';
import type { SystemRole } from '../authorization/permissions';

/** An invitation as its email tells it, in the language it carries. */
export interface InvitationMailContext {
  locale: Locale;
  to: string;
  /**
   * Who invited them, while still a member of the organization; null once
   * they have left or deleted their account, and the organization alone
   * is named (ADR-077). A reply goes to their address while they are
   * named (ADR-083).
   */
  inviter: { name: string; email: string } | null;
  organizationName: string;
  /** The roles in words, in the invitation's language. */
  roles: { name: string; description: string | null }[];
  /** What the lead's article goes by (systemOf, ADR-080). */
  system: SystemRole | 'other';
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
 * The invitation (ADR-077): who invited them, by name and by address so it
 * can be told from a forgery, or the organization alone once the inviter
 * has gone; to which organization and as what, with what that lets them
 * do; the inviter's note; and the link's last day, named in the
 * organization's zone. The organization is named in words, never by its
 * logo: mail apps block an inline image.
 *
 * Written on the layout every email shares (ADR-083), with no product
 * header: its heading opens it, Accept the invitation is its button, and
 * its last line is small print. While the inviter is named, a reply goes
 * to them rather than to MAIL_FROM's no-reply address, which nobody reads;
 * once they have gone, the email names nobody to reply to.
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
  const roles = context.roles.map((role) => role.name);
  const system = context.system;
  const lead = say(
    context.inviter
      ? t(
          {
            id: 'mail.invitation.lead',
            defaultMessage:
              '{inviter} ({email}) invited you to join as {system, select, Owner {an {roles}} Admin {an {roles}} Viewer {a {roles}} other {{roles}}}.',
          },
          { inviter, email: context.inviter.email, roles, system },
        )
      : t(
          {
            id: 'mail.invitation.leadOrganization',
            defaultMessage:
              '{organization} invited you to join as {system, select, Owner {an {roles}} Admin {an {roles}} Viewer {a {roles}} other {{roles}}}.',
          },
          { organization, roles, system },
        ),
  );
  // What each role is for: its line alone for one role, and beside its
  // name for several, so each line says whose it is.
  const described = context.roles.filter((role) => role.description);
  const lines = described.map((role) =>
    context.roles.length === 1
      ? role.description!
      : say(
          t(
            {
              id: 'mail.invitation.roleLine',
              defaultMessage: '{role}: {description}',
            },
            { role: role.name, description: role.description },
          ),
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

  const mail = writeMail({
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
    locale: context.locale,
    blocks: [
      { kind: 'heading', text: heading },
      { kind: 'paragraph', text: lead },
      ...lines.map((line) => ({ kind: 'paragraph' as const, text: line })),
      ...(context.note
        ? [{ kind: 'quote' as const, title: from, text: context.note }]
        : []),
      // The text part's link on the line below says what follows: no
      // colon, which each language would write its own way (：in Chinese).
      { kind: 'button', label: accept, href: context.link },
      { kind: 'paragraph', text: expires },
      { kind: 'paragraph', text: ignore },
      { kind: 'footer', text: footer },
    ],
  });
  return context.inviter ? { ...mail, replyTo: context.inviter.email } : mail;
}
