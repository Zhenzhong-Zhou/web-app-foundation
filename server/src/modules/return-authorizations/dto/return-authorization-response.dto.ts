import type {
  ReturnAuthorizationStatus,
  ReturnResolution,
} from '../../../database/schema';
import type { ChosenSite } from '../../locations/dto/location-response.dto';

/**
 * Return authorizations as the API returns them (ADR-068, ADR-047),
 * described for the OpenAPI document by the CLI plugin: not the
 * organization, or who created, closed or cancelled one.
 */

/** A row in the returns list. */
export class ReturnAuthorizationSummary {
  id!: string;
  number!: string;
  status!: ReturnAuthorizationStatus;
  orderId!: string;
  /** The order's own number (ADR-071); the reference is theirs. */
  orderNumber!: string;
  orderReference!: string | null;
  partnerId!: string;
  partnerName!: string;
  reason!: string;
  expectsGoods!: boolean;
  createdAt!: Date;
}

/** GET /return-authorizations: one page, newest first. */
export class ReturnAuthorizationPage {
  entries!: ReturnAuthorizationSummary[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

/** One item on an RMA, with what has happened to it so far. */
export class ReturnAuthorizationLine {
  id!: string;
  orderLineId!: string;
  variantId!: string;
  sku!: string;
  /** Authorized: the ceiling for returns and credits against this line. */
  quantity!: string;
  resolution!: ReturnResolution;
  quantityReceived!: string;
  quantityCredited!: string;
}

export class ReturnAuthorizationDetail {
  id!: string;
  number!: string;
  status!: ReturnAuthorizationStatus;
  orderId!: string;
  /** The order's own number (ADR-071); the reference is theirs. */
  orderNumber!: string;
  orderReference!: string | null;
  partnerId!: string;
  partnerName!: string;
  /** The invoice the customer quoted, if any; the credit defaults to it. */
  invoiceId!: string | null;
  invoiceNumber!: string | null;
  reason!: string;
  /** False when the customer was told to keep or destroy the goods. */
  expectsGoods!: boolean;
  /**
   * Where the goods come back to (ADR-071, amended). Null when nothing
   * comes back, and when no site was chosen, which prints the registered
   * address.
   */
  sendBackTo!: ChosenSite | null;
  note!: string | null;
  createdAt!: Date;
  closedAt!: Date | null;
  cancelledAt!: Date | null;
  lines!: ReturnAuthorizationLine[];
}

/** Reading or creating an RMA: the RMA as it now is. */
export class ReturnAuthorizationEnvelope {
  returnAuthorization!: ReturnAuthorizationDetail;
}

/** The replacement sale, by id: the client opens the order to read it. */
export class ReplacementOrder {
  id!: string;
}

/** POST /return-authorizations/:id/replacement. */
export class ReplacementEnvelope {
  order!: ReplacementOrder;
}
