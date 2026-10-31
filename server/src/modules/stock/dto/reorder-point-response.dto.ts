import type { ReorderRule, ReorderSource } from '../../../database/schema';
import type { ReorderStatus } from '../reorder-position';

/**
 * Reorder points as the API returns them (ADR-068, ADR-085): each item
 * with a point and where it stands, the counts beside the list's filters,
 * and an opened row's lines. Quantities are numeric(18,4) strings, worked
 * out on the server (ADR-025), in the item's own unit.
 */

/** A draft purchase or run of the item: shown, never counted as coming. */
export class ReorderPointDraft {
  kind!: 'purchase' | 'run';
  /** The order's or the run's id, for its link. */
  id!: string;
  /**
   * What it is called: the purchase's number, or the run's reference,
   * null for a run that has none, which its page titles by its quantity.
   */
  number!: string | null;
  /** The item's quantity on it: a line's ordered, a run's planned output. */
  quantity!: string;
}

/** One item with a reorder point, and its position. */
export class ReorderPointRow {
  /** The point itself; also the list's cursor (ADR-051). */
  id!: string;
  variantId!: string;
  sku!: string;
  /** In the reader's language (ADR-056). */
  productName!: string;
  variantName!: string | null;
  unitOfMeasure!: string;
  source!: ReorderSource;
  reorderPoint!: string;
  rule!: ReorderRule;
  /** A fixed rule's quantity, ordered in whole multiples of it. */
  fixedQuantity!: string | null;
  /** A maximum rule's level, above the point. */
  maximumQuantity!: string | null;
  /** At locations marked available, less lots expired and stock issued to runs. */
  usable!: string;
  /** Confirmed purchases still to receive, and released runs' output still to come. */
  coming!: string;
  /** Confirmed sales still to ship. */
  stillNeeded!: string;
  /** Draft purchases and draft runs: shown, not counted. */
  inDraft!: string;
  /** Usable, plus coming, less still needed. */
  position!: string;
  status!: ReorderStatus;
  /** What its rule asks for, less what is in draft; zero when not low. */
  suggestion!: string;
  /** How many of the fixed quantity the suggestion is; null for the other rules. */
  suggestedMultiples!: string | null;
  /** Each draft adding to it, newest first. */
  drafts!: ReorderPointDraft[];
}

/** GET /stock/reorder-points: one page. */
export class ReorderPointPage {
  entries!: ReorderPointRow[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

/** GET /stock/reorder-points/counts: beside All, Low and Out. */
export class ReorderPointCounts {
  /** Every item with a point. */
  all!: number;
  /** Below the point, the out among them. */
  low!: number;
  /** At zero or less: nothing usable and nothing coming. */
  out!: number;
}

/** Usable stock at one location marked available, and what was left out. */
export class UsableStock {
  locationId!: string;
  locationName!: string;
  usable!: string;
  /** In lots expired by the organization's today. */
  expired!: string;
  /** Issued to released runs there and not yet consumed. */
  issued!: string;
}

/** A confirmed purchase or a released run still bringing the item. */
export class ComingSupply {
  kind!: 'purchase' | 'run';
  /** The order's or the run's id, for its link. */
  id!: string;
  /** The purchase's number, or the run's reference, null when it has none. */
  number!: string | null;
  /** The supplier, or a run's co-packer; null for a run made in-house. */
  partnerName!: string | null;
  /** Still to receive, or still to come out of the run. */
  quantity!: string;
  /** A purchase's expected day; a run has none. */
  expectedAt!: string | null;
  /** Expected before the organization's today. */
  late!: boolean;
}

/** A confirmed sale still needing the item. */
export class StillNeeded {
  orderId!: string;
  number!: string;
  /** The customer. */
  partnerName!: string;
  /** Still to ship. */
  quantity!: string;
  expectedAt!: string | null;
}

/** GET /stock/reorder-points/:variantId: an opened row's lines. */
export class ReorderPointDetail {
  /** By location, each marked available that holds the item. */
  usable!: UsableStock[];
  /** Left out in all, as expired. */
  expired!: string;
  /** Left out in all, as issued to runs. */
  issued!: string;
  coming!: ComingSupply[];
  stillNeeded!: StillNeeded[];
  drafts!: ReorderPointDraft[];
}
