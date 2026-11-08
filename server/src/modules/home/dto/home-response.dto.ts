import type { MemberAccess } from '../../../core/authorization/dto/member-access-response.dto';
import type { HomeKind } from '../home-kinds';
import type { WelcomeDoneKind, WelcomeItemKey } from '../welcome.service';

/**
 * Home as the API returns it (ADR-068, ADR-058), described for the
 * OpenAPI document by the CLI plugin.
 */

/**
 * One of Home's tiles, in the reader's order (ADR-091, amended November
 * 2026): every row the list it opens shows, and no rows of its own.
 */
export class HomeCard {
  kind!: HomeKind;
  /**
   * Hidden by the reader in Customise Home, or by default, as Drafts is:
   * still counted, its late items in the panel of what is late, but not
   * drawn as a tile.
   */
  hidden!: boolean;
  /** Every row its list shows, filtered as the tile opens it. */
  count!: number;
  /**
   * How many of them are late: overdue orders, expired lots and licences,
   * low items that are out.
   */
  late!: number;
  /**
   * Low stock's: whether any item has a reorder point, so nothing low is
   * told apart from nothing watched (ADR-085); null on every other tile.
   */
  anyPoint!: boolean | null;
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

/**
 * Home's default arrangement for the reader (ADR-091, amended November
 * 2026), as the layout Done saves: every tile they may see in their
 * role's default order, the ones hidden by default, and Recently opened
 * on. What Customise Home's Reset to default puts back, and what Done
 * compares with, clearing the layout when they are the same.
 */
export class HomeDefaultLayout {
  order!: HomeKind[];
  hidden!: HomeKind[];
  recent!: boolean;
}

/** GET /home. */
export class HomeResponse {
  /**
   * The organization's What we do (ADR-091), in its own words, for every
   * member; null until written.
   */
  whatWeDo!: string | null;
  gettingStarted!: GettingStarted;
  /** The reader's welcome, or null when it does not show. */
  welcome!: Welcome | null;
  /**
   * Every tile the reader may see, in their order or their role's
   * default, the hidden ones among them.
   */
  cards!: HomeCard[];
  /** Whether Recently opened shows: the reader's choice, true by default. */
  recent!: boolean;
  /** The arrangement with no layout saved, whatever the reader saved. */
  defaultLayout!: HomeDefaultLayout;
}
