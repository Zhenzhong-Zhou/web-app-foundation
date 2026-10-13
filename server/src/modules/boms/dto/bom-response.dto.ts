import type { BomStatus } from '../../../database/schema';

/**
 * Recipes as the API returns them (ADR-068, ADR-029), described for the
 * OpenAPI document by the CLI plugin: not the organization or the
 * timestamps the rows carry.
 */
export class Bom {
  id!: string;
  outputVariantId!: string;
  /** Yield: what one batch makes, not an amount per unit. */
  outputQuantity!: string;
  version!: number;
  status!: BomStatus;
  licenceId!: string | null;
  notes!: string | null;
}

/** One component of a recipe. */
export class BomLine {
  id!: string;
  componentVariantId!: string;
  /** In the component variant's own unit: bom_lines carries none. */
  quantity!: string;
  supplyType!: 'stocked' | 'external';
  notes!: string | null;
}

/** GET /boms/:id: the recipe with its components. */
export class BomDetail extends Bom {
  lines!: BomLine[];
  /**
   * True once a run has been made against a promoted recipe. Until then
   * the licence can still be attached (ADR-029).
   */
  licenceLocked!: boolean;
}

/** Creating or duplicating a recipe: the recipe as it now is. */
export class BomEnvelope {
  bom!: BomDetail;
}

/** POST /boms/:id/lines: the line as the recipe shows it. */
export class BomLineEnvelope {
  line!: BomLine;
}
