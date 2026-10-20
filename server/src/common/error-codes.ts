/**
 * Codes beside a refusal's message, for a client to act on (conventions.md,
 * "Error codes").
 *
 * The message is for a person: it changes with the reader's language
 * (ADR-054) and with every copy edit. A screen that can offer the way out —
 * a link to the setting that is missing — needs something that does
 * neither, so the refusal carries a code as well, and the screen keys on
 * that, never on the words.
 *
 * Added one at a time, where a screen has something to offer; most refusals
 * carry none. Never renamed or removed once released: a browser still
 * running the previous client may be keying on it. The client's type is
 * generated from the OpenAPI document, where this list is the ErrorCode
 * enum (ADR-068).
 */
export const ERROR_CODES = {
  /** No registered address, which every invoice prints (ADR-046, ADR-061). */
  organizationAddressMissing: 'organization_address_missing',
  /** The customer has no billing address to invoice to (ADR-046). */
  customerBillingAddressMissing: 'customer_billing_address_missing',
  /** An invoice charges tax, and the seller has no tax number (ADR-046). */
  organizationTaxNumberMissing: 'organization_tax_number_missing',
  /**
   * The only Owner of an organization with other members cannot leave it
   * or delete their account until another member is Owner (ADR-069).
   */
  lastOwnerWithMembers: 'last_owner_with_members',
  /**
   * The only member of an organization cannot leave it or delete their
   * account while it exists (ADR-069).
   */
  onlyMember: 'only_member',
  /**
   * Deleting an organization needs an export taken in the last 24 hours,
   * or one declined (ADR-070).
   */
  organizationExportRequired: 'organization_export_required',
  /**
   * The deletion day has ended everywhere, so the deletion can no longer
   * be cancelled (ADR-070).
   */
  organizationDeletionUnderWay: 'organization_deletion_under_way',
  /**
   * The password typed to confirm a change is not the account's (ADR-069,
   * ADR-070): the screen marks the field that holds it (#120).
   */
  passwordIncorrect: 'password_incorrect',
  /**
   * Two series could print the same numbers (ADR-073): `details.series`
   * names both, as the API does (`creditNote`), for the screen to mark.
   */
  numberingPrefixShared: 'numbering_prefix_shared',
  /**
   * A series would give a number a document already carries, or go below
   * the numbers given (ADR-073): `details.series` names it, and
   * `details.lowest` is the least next number accepted, when there is one.
   */
  numberingNumberTaken: 'numbering_number_taken',
  /**
   * Invoices and credit notes are kept in date order, and this one is
   * dated before the latest in its series (ADR-073).
   */
  numberingDateOrder: 'numbering_date_order',
  /** The address is already a member of this organization (ADR-077). */
  alreadyAMember: 'already_a_member',
  /**
   * The address already has a pending invitation here, which can be resent
   * (ADR-077): `details.invitationId` names it.
   */
  alreadyInvited: 'already_invited',
  /**
   * Inviting needs the inviter's own address verified (ADR-077): the screen
   * offers to resend their verification.
   */
  emailUnverified: 'email_unverified',
  /**
   * The organization has issued its 50 invitation links in the last 24
   * hours (ADR-077): `details.at` is when the next one can be.
   */
  invitationsDailyLimit: 'invitations_daily_limit',
  /**
   * The account accepting an invitation is to be deleted (ADR-069,
   * ADR-077): `details.day` is its day, and the page offers Keep my
   * account, then Join.
   */
  accountDeletionScheduled: 'account_deletion_scheduled',
  /**
   * An invitation's link is used, past its days or revoked, all alike
   * (ADR-077): the page shows that it ended, never the field it was
   * accepting with.
   */
  invitationEnded: 'invitation_ended',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const KNOWN: ReadonlySet<string> = new Set(Object.values(ERROR_CODES));

/**
 * What a few codes carry for the screen to act on, beside the code itself:
 * which series a numbering refusal is about, and the least next number it
 * would accept (ADR-073); the invitation to resend, when the next link can
 * be made, and the day an account is to be deleted (ADR-077). Never
 * words: those are the message's.
 */
export interface ErrorDetails {
  series?: string[];
  lowest?: number;
  invitationId?: string;
  /** A moment, ISO 8601, for the screen to show in its reader's time. */
  at?: string;
  /** A calendar day, YYYY-MM-DD (ADR-052). */
  day?: string;
}

/**
 * A refusal's response body with its code beside the message:
 *
 *     throw new ConflictException(
 *       withCode(t({ id, defaultMessage }), ERROR_CODES.organizationAddressMissing),
 *     );
 */
export function withCode<T extends object>(
  response: T,
  code: ErrorCode,
  details?: ErrorDetails,
): T & { code: ErrorCode; details?: ErrorDetails } {
  return { ...response, code, ...(details ? { details } : {}) };
}

/**
 * The code an exception's response carries, when it is one of ours. Anything
 * else under that key, such as a driver's error code passed on by mistake,
 * stays out of what the client is told.
 */
export function codeOf(response: unknown): ErrorCode | undefined {
  if (typeof response !== 'object' || response === null) return undefined;
  const { code } = response as { code?: unknown };
  return typeof code === 'string' && KNOWN.has(code)
    ? (code as ErrorCode)
    : undefined;
}

/**
 * The details beside a code of ours, and only beside one: a body with no
 * known code says nothing more. Only withCode puts them there, typed.
 */
export function detailsOf(response: unknown): ErrorDetails | undefined {
  return codeOf(response)
    ? (response as { details?: ErrorDetails }).details
    : undefined;
}
