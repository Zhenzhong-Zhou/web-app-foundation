import type { OrganizationAddress, SiteAddress } from '../api/types.gen';

/**
 * An address as AddressFields holds it: every part a string, blank for
 * none. Its own module, since a component's file may export only
 * components for Fast Refresh to keep its state.
 */
export interface AddressValues {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

/** The form's start: the address as it is, or every part blank. */
export function addressValues(
  address: OrganizationAddress | SiteAddress | null,
): AddressValues {
  return {
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? '',
    region: address?.region ?? '',
    postalCode: address?.postalCode ?? '',
    country: address?.country ?? '',
  };
}

/**
 * The address as a PUT takes it, sent whole: a part left blank is sent as
 * null, cleared. Null rather than left out, so the request says what it
 * clears and the audit log shows it going, "Suite 200 → —": a part left
 * out is not logged, and a save that only cleared one logged nothing.
 */
export function addressBody(values: AddressValues) {
  return {
    line1: values.line1,
    line2: values.line2 || null,
    city: values.city || null,
    region: values.region || null,
    postalCode: values.postalCode || null,
    country: values.country,
  };
}
