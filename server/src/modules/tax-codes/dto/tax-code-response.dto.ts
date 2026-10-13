/**
 * Tax codes as the API returns them (ADR-068): what the client reads, and
 * nothing it does not, such as the organization a code belongs to or when
 * it was written. The CLI plugin describes each property from its type for
 * the OpenAPI document, and the client's types are generated from that.
 */

/** One tax a code charges (ADR-046). */
export class TaxCodeComponent {
  id!: string;
  /** What the invoice's tax line says: "GST", "PST". */
  name!: string;
  /** A percentage: "5.0000" is 5%. */
  rate!: string;
}

export class TaxCode {
  id!: string;
  name!: string;
  isActive!: boolean;
  /** Empty for an Exempt code, which charges nothing and says so. */
  components!: TaxCodeComponent[];
}

/** GET /tax-codes: active codes first, then by name. */
export class TaxCodeList {
  taxCodes!: TaxCode[];
}

/** POST /tax-codes: the code as created. */
export class CreatedTaxCode {
  taxCode!: TaxCode;
}
