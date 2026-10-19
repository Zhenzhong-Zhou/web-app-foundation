import type { Locale } from '../../../common/locales';

/**
 * Invitations as the API returns them (ADR-068, ADR-077), described for the
 * OpenAPI document by the CLI plugin.
 */

/**
 * Where an invitation's link stands: emailed or copied, and live; an email
 * that did not go, whose link nobody received; or ended, not accepted.
 */
export type InvitationLinkStatus = 'emailed' | 'copied' | 'notSent' | 'ended';

/** Who sent an invitation. */
export class InvitationSender {
  id!: string;
  name!: string;
}

/** An invitation's link, as Invited shows it. */
export class InvitationLinkState {
  status!: InvitationLinkStatus;
  /**
   * Its last day, YYYY-MM-DD in the organization's zone (ADR-072): the
   * day it ends, or ended. Null when the email did not go.
   */
  lastDay!: string | null;
}

/** One pending invitation, as Members' Invited lists it. */
export class Invitation {
  id!: string;
  email!: string;
  roleId!: string;
  invitedBy!: InvitationSender;
  invitedAt!: Date;
  link!: InvitationLinkState;
}

/** A resend. */
export class InvitationEnvelope {
  invitation!: Invitation;
}

/**
 * POST /invitations: the invitation, and its link when it went by link
 * for the inviter to pass on; null when it was emailed.
 */
export class CreatedInvitation {
  invitation!: Invitation;
  link!: string | null;
}

/**
 * Copy link: the link itself, built on the server from CLIENT_URL, the
 * only side that knows the token.
 */
export class CopiedInvitationLink {
  invitation!: Invitation;
  link!: string;
}

/** The organization an invitation is to. */
export class InvitationOrganization {
  name!: string;
  /**
   * Its logo as a PNG data: URL, about 64 px tall for a page that shows it
   * at 32, or null when it has none.
   */
  logo!: string | null;
  /**
   * Its deletion day, YYYY-MM-DD, while one is pending (ADR-070): nobody
   * joins it, and the page says so at once. Null otherwise.
   */
  deletionScheduledAt!: string | null;
}

/** Who invited them, by name and by address. */
export class InvitationInviter {
  name!: string;
  email!: string;
}

/** The role it grants, in words, in the request's language. */
export class InvitationRole {
  name!: string;
  description!: string | null;
}

/** An invitation as its page shows it, and nothing more. */
export class InvitationPreview {
  /** The address it is for, which the page shows and does not let change. */
  email!: string;
  organization!: InvitationOrganization;
  /**
   * Who invited them, while still a member of the organization; null once
   * they have left or deleted their account, and the page names the
   * organization alone (ADR-077).
   */
  inviter!: InvitationInviter | null;
  role!: InvitationRole;
  note!: string | null;
  /** The link's last day, YYYY-MM-DD in the organization's zone. */
  lastDay!: string;
  /** Decides between creating an account and signing in to join. */
  hasAccount!: boolean;
  /** The language the page starts in, the inviter's choice. */
  locale!: Locale;
}

/**
 * POST /invitations/read. Null for a link used, expired or revoked, all
 * alike, so an old or guessed link says nothing more.
 */
export class InvitationRead {
  invitation!: InvitationPreview | null;
}
