/**
 * Product licences as the API returns them (ADR-068, ADR-050): what the
 * client reads, and not the organization or the reminder bookkeeping the
 * licence reminders keep on the row (ADR-064).
 */
export class ProductLicence {
  id!: string;
  number!: string;
  authority!: string;
  isActive!: boolean;
  /** When it took effect; null when nobody recorded it. */
  issuedAt!: string | null;
  /** Null for schemes that do not expire, which includes an NPN. */
  expiresAt!: string | null;
  notes!: string | null;
}

/** POST /product-licences: the licence as created. */
export class LicenceEnvelope {
  licence!: ProductLicence;
}
