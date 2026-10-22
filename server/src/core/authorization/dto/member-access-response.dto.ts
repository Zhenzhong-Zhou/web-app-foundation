/**
 * What a member may do here, as the welcome on Home and Your access on
 * Account show it (ADR-079, ADR-068), described for the OpenAPI document
 * by the CLI plugin.
 */

/**
 * A role the member holds, as stored: a built-in role's name and line are
 * worded by the client, as on People and Members (ADR-054); a role an
 * organization made shows as it named and described it.
 */
export class MemberRole {
  name!: string;
  description!: string | null;
}

/** A colleague named on the card, whose name opens their page on People. */
export class Colleague {
  id!: string;
  name!: string;
}

/** GET /account/membership, and the welcome's own. */
export class MemberAccess {
  /** Every role they hold, the built-in one first (ADR-080). */
  roles!: MemberRole[];
  /**
   * Holds every permission there is, whatever the role is called: the
   * client then says it in one line rather than an area at a time.
   */
  holdsEverything!: boolean;
  /**
   * Up to three members who could change the reader's roles, as a refusal
   * names them: the Owners first, then those who joined first, never the
   * reader; none for a reader who may change roles.
   */
  whomToAsk!: Colleague[];
}
