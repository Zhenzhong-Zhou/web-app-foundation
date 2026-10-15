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
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

const KNOWN: ReadonlySet<string> = new Set(Object.values(ERROR_CODES));

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
): T & { code: ErrorCode } {
  return { ...response, code };
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
