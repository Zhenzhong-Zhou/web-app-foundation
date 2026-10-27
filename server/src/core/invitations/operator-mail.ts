import type { MailContent } from '../../shared/mail/mail-layout';

/** What the operator is told when an organization invitation is accepted. */
export interface OrganizationStartedContext {
  to: string;
  organizationName: string;
  /** Who set it up, as they named themselves, and their address. */
  name: string;
  email: string;
  at: Date;
  /** Whether their address is confirmed yet; never, by a printed link. */
  verified: boolean;
}

/**
 * The operator's email (ADR-078), when OPERATOR_EMAIL is set: which
 * organization, set up by whom, and when. In English, as the command
 * speaks English: only the operator reads it. A courtesy, not a record,
 * so it says nothing a person would need to keep.
 */
export function organizationStartedMail(
  context: OrganizationStartedContext,
): MailContent {
  const when = `${new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(context.at)} UTC`;

  const paragraphs = [
    `${context.name} (${context.email}) accepted the invitation and set up ${context.organizationName} on ${when}. They are its Owner.`,
    context.verified
      ? 'Their address is confirmed.'
      : 'Their address isn’t confirmed yet: the app has asked them to confirm it before they invite anyone.',
    'Sent because OPERATOR_EMAIL is set on this server.',
  ];

  return {
    to: context.to,
    subject: `${context.organizationName} was set up`,
    locale: 'en',
    blocks: paragraphs.map((text) => ({ kind: 'paragraph', text })),
  };
}
