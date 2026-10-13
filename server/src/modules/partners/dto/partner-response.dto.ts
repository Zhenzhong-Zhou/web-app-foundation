import type { Locale } from '../../../common/locales';

/**
 * Partners as the API returns them (ADR-068, ADR-026), described for the
 * OpenAPI document by the CLI plugin: not the organization, the pinyin
 * kept for search, or the location and owner columns an address shares
 * with the organization's own.
 */

/** A customer or supplier: one table for both (ADR-026). */
export class Partner {
  id!: string;
  name!: string;
  code!: string | null;
  taxId!: string | null;
  /** The lists its orders take default prices from (ADR-049). */
  salePriceListId!: string | null;
  purchasePriceListId!: string | null;
  /**
   * What its documents print in (ADR-054). Null on the first means the
   * organization's pair; the second is only ever set with a first.
   */
  documentLanguage!: Locale | null;
  documentSecondLanguage!: Locale | null;
  notes!: string | null;
  isActive!: boolean;
}

/** One of a partner's addresses. */
export class Address {
  id!: string;
  label!: string | null;
  line1!: string;
  line2!: string | null;
  city!: string | null;
  region!: string | null;
  postalCode!: string | null;
  country!: string;
  isBilling!: boolean;
  isShipping!: boolean;
  isDefault!: boolean;
  isActive!: boolean;
}

/** One of a partner's people. */
export class Contact {
  id!: string;
  name!: string;
  role!: string | null;
  email!: string | null;
  phone!: string | null;
  notes!: string | null;
  isPrimary!: boolean;
  isActive!: boolean;
}

/** GET /partners/:id: the partner with its addresses and contacts. */
export class PartnerDetail extends Partner {
  addresses!: Address[];
  contacts!: Contact[];
}

/** POST /partners: the partner as created. */
export class PartnerEnvelope {
  partner!: PartnerDetail;
}

/** POST /partners/:id/addresses: the address as created. */
export class AddressEnvelope {
  address!: Address;
}

/** POST /partners/:id/contacts: the contact as created. */
export class ContactEnvelope {
  contact!: Contact;
}
