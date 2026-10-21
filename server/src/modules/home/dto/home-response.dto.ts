import type { MemberAccess } from '../../../core/authorization/dto/member-access-response.dto';
import type { HomeKind } from '../home.service';
import type { WelcomeDoneKind, WelcomeItemKey } from '../welcome.service';

/**
 * Home as the API returns it (ADR-068, ADR-058), described for the
 * OpenAPI document by the CLI plugin.
 */

/** One record a card lists. */
export class HomeRow {
  id!: string;
  title!: string;
  detail!: string | null;
  /** A calendar day, YYYY-MM-DD (ADR-052). */
  due!: string | null;
  late!: boolean;
}

/** One of Home's cards, in the order of a working day. */
export class HomeCard {
  kind!: HomeKind;
  count!: number;
  late!: number;
  rows!: HomeRow[];
}

/** Which getting-started steps the organization has done. */
export class GettingStartedSteps {
  organization!: boolean;
  location!: boolean;
  product!: boolean;
  partner!: boolean;
  receipt!: boolean;
  invoice!: boolean;
  team!: boolean;
}

export class GettingStarted {
  steps!: GettingStartedSteps;
  teamSkipped!: boolean;
  dismissed!: boolean;
  complete!: boolean;
}

/**
 * What a done item of the first week says was done: a record, by Recently
 * opened's kinds, which the client opens; or the person's own address,
 * photo or job title, which open Account.
 */
export class WelcomeDone {
  kind!: WelcomeDoneKind;
  /** The record, or null for the person's own, or a record since deleted. */
  id!: string | null;
  /**
   * The record's name now, as Recently opened names it: a lot's code, an
   * order's number, a draft invoice's customer; null where it has none.
   */
  words!: string | null;
}

/** One item of the first week, chosen and ticked by the server. */
export class WelcomeItem {
  key!: WelcomeItemKey;
  done!: boolean;
  /** What was done, once it is; null until then. */
  what!: WelcomeDone | null;
}

/** The newcomer's welcome (ADR-079), while it shows. */
/** Who invited the reader, under whose photo or initials their note shows. */
export class Inviter {
  id!: string;
  name!: string;
  photoFileId!: string | null;
}

export class Welcome {
  /** The day the membership began, YYYY-MM-DD in the organization's zone. */
  joinedOn!: string;
  /** The last day it shows, YYYY-MM-DD in the organization's zone. */
  lastDay!: string;
  /** Started the organization: its first membership, with no inviter. */
  founder!: boolean;
  /**
   * Who invited them, while still a member here; null once they have left
   * or deleted their account, and for a membership no invitation made.
   */
  inviter!: Inviter | null;
  /** The inviter's note as typed, plain text; the organization's once they are gone. */
  note!: string | null;
  access!: MemberAccess;
  items!: WelcomeItem[];
}

/** GET /home. */
export class HomeResponse {
  gettingStarted!: GettingStarted;
  /** The reader's welcome, or null when it does not show. */
  welcome!: Welcome | null;
  cards!: HomeCard[];
}
