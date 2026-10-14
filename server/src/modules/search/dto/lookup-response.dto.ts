import type { LookupKind } from '../lookup.service';

/**
 * The top bar's lookup as the API returns it (ADR-068, ADR-056),
 * described for the OpenAPI document by the CLI plugin.
 */

/** One record the lookup found; the client builds its address. */
export class LookupResult {
  id!: string;
  title!: string;
  detail!: string | null;
  status!: string | null;
  /** A calendar day, YYYY-MM-DD (ADR-052). */
  expiresAt!: string | null;
  productId!: string | null;
  /** An item's product's cover (ADR-066); null for other kinds. */
  coverFileId!: string | null;
  /** Found by similarity, after the exact matches: a typo. */
  close!: boolean;
}

export class LookupGroup {
  kind!: LookupKind;
  results!: LookupResult[];
}

/** GET /lookup: the kinds in the order to show them. */
export class LookupResponse {
  groups!: LookupGroup[];
}
