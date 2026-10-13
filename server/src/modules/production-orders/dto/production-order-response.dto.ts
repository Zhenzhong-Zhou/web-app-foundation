import type { ReleaseLicenceStatus, RunStatus } from '../../../database/schema';
import type {
  LicenceOutcome,
  LicenceStatusAtRelease,
} from '../../product-licences/licence-status';
import type { RecordedMovement } from '../../stock/dto/stock-response.dto';

/**
 * Production runs as the API returns them (ADR-068, ADR-030), described
 * for the OpenAPI document by the CLI plugin: not the organization, a
 * line's notes, or the timestamps the rows carry.
 */

export class ProductionRun {
  id!: string;
  outputVariantId!: string;
  bomId!: string | null;
  /** Set when a co-packer makes it (ADR-030). */
  partnerId!: string | null;
  locationId!: string;
  quantityPlanned!: string;
  quantityProduced!: string;
  status!: RunStatus;
  /** What people call this run: a batch number, a works order. */
  reference!: string | null;
  /** Copied at release, so it says what the batch was made under then. */
  licenceId!: string | null;
  licenceNumber!: string | null;
  licenceAuthority!: string | null;
  /** Its state at release, and any override (ADR-050). */
  licenceStatusAtRelease!: ReleaseLicenceStatus | null;
  licenceOverriddenBy!: string | null;
  licenceOverrideReason!: string | null;
  notes!: string | null;
  createdAt!: Date;
}

/** GET /production-orders: one page. */
export class RunPage {
  entries!: ProductionRun[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

export class RunLine {
  id!: string;
  componentVariantId!: string;
  /** Snapshotted at release, not joined from the variant (ADR-029). */
  sku!: string;
  unitOfMeasure!: string;
  quantityPlanned!: string;
  quantityConsumed!: string;
  supplyType!: 'stocked' | 'external';
  sourceLocationId!: string | null;
  externalLotCode!: string | null;
}

/**
 * One lot of one component, as it went into a run: the recall trail
 * (ADR-039). Issued includes top-ups; consumed is filled in at close.
 */
export class ComponentLot {
  componentVariantId!: string;
  lotId!: string;
  code!: string;
  expiresAt!: string | null;
  issued!: string;
  consumed!: string;
}

/** GET /production-orders/:id. */
export class RunDetail extends ProductionRun {
  /** Who overrode the licence policy at release, by name. */
  licenceOverriddenByName!: string | null;
  lines!: RunLine[];
  componentLots!: ComponentLot[];
  /** Lot ids, read from the run's production movements (ADR-032). */
  outputLots!: string[];
}

/** Creating a run: the run as it now is. */
export class ProductionOrderEnvelope {
  productionOrder!: RunDetail;
}

/** A lot at the source, with what earliest-expiry-first would take. */
export class IssuePlanLot {
  lotId!: string;
  code!: string;
  expiresAt!: string | null;
  onHand!: string;
  take!: string;
  taken!: boolean;
}

/** One recipe line as release would issue it, before anything moves. */
export class IssuePlanLine {
  componentVariantId!: string;
  sku!: string;
  unitOfMeasure!: string;
  tracksLots!: boolean;
  supplyType!: 'stocked' | 'external';
  quantity!: string;
  lots!: IssuePlanLot[];
  /** How much the source is missing, or null when it can cover the line. */
  shortBy!: string | null;
}

/** The licence a run would be released under. */
export class CheckedLicence {
  id!: string;
  number!: string;
  authority!: string;
  /** Calendar days, YYYY-MM-DD (ADR-052). */
  issuedAt!: string | null;
  expiresAt!: string | null;
}

/** What release would do with a run's licence (ADR-050). */
export class LicenceCheck {
  licence!: CheckedLicence | null;
  status!: LicenceStatusAtRelease;
  outcome!: LicenceOutcome;
}

/** GET /production-orders/:id/issue-plan. */
export class IssuePlan {
  lines!: IssuePlanLine[];
  licenceCheck!: LicenceCheck;
}

/** POST /production-orders/:id/release: the lines as released. */
export class ReleasedRun {
  lines!: RunLine[];
}

/** POST /production-orders/:id/output: the movement it wrote. */
export class OutputEnvelope {
  movement!: RecordedMovement;
}

/** The batch against its own plan, when it is far enough off to say so. */
export class OutputVariance {
  quantityPlanned!: string;
  quantityProduced!: string;
  variance!: number;
}

export class LineVariance {
  lineId!: string;
  componentVariantId!: string;
  sku!: string;
  quantityPlanned!: string;
  quantityConsumed!: string;
  variance!: number;
}

/** POST /production-orders/:id/close: how far the run strayed. */
export class ClosedRun {
  variances!: LineVariance[];
  outputVariance!: OutputVariance | null;
}

/** POST /production-orders/:id/cancel: lines left with stock to return. */
export class CancelledRun {
  strandedLines!: RunLine[];
}
