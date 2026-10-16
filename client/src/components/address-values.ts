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

/** The parts an address the API sends has, any of them null but two. */
interface SentAddress {
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
}

/** The form's start: the address as it is, or every part blank. */
export function addressValues(address: SentAddress | null): AddressValues {
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
 * The address as a PUT takes it, sent whole: a part left blank is left
 * out, and so cleared.
 */
export function addressBody(values: AddressValues) {
  return {
    line1: values.line1,
    line2: values.line2 || undefined,
    city: values.city || undefined,
    region: values.region || undefined,
    postalCode: values.postalCode || undefined,
    country: values.country,
  };
}
