import { and, asc, desc, eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import {
  addresses,
  locations,
  memberships,
  organizations,
  users,
} from '../../database/schema';
import { registeredAddress } from '../organizations/registered-address';

/**
 * Who and where a document names, read as they are when it is drawn
 * (ADR-071, amended): the pro forma, the purchase order and the RMA store
 * nothing at issue, unlike an invoice, so each printing says what is true
 * that day.
 */

/** An address as a document prints it, one part per line. */
export interface PrintedAddress {
  line1: string | null;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}

/** The columns a document prints of an address. */
const PRINTED = {
  line1: addresses.line1,
  line2: addresses.line2,
  city: addresses.city,
  region: addresses.region,
  postalCode: addresses.postalCode,
  country: addresses.country,
};

/** An address row's printed parts, nothing else from it. */
function printed(row: PrintedAddress): PrintedAddress {
  return {
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
  };
}

/** The address as the lines party() and addressLines() take. */
export function addressParts(
  address: PrintedAddress | null,
): (string | null)[] {
  return address
    ? [
        address.line1,
        address.line2,
        address.city,
        address.region,
        address.postalCode,
        address.country,
      ]
    : [];
}

/** The organization as a document's From: name, tax number, address. */
export interface Seller {
  name: string;
  taxNumber: string | null;
  /** The registered address; null while none is set, printed without. */
  address: PrintedAddress | null;
}

export async function sellerOf(
  tx: Transaction,
  organizationId: string,
): Promise<Seller> {
  const [organization] = await tx
    .select({
      name: organizations.name,
      taxNumber: organizations.taxRegistrationNumber,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  const address = await registeredAddress(tx, organizationId);

  return {
    name: organization?.name ?? '',
    taxNumber: organization?.taxNumber ?? null,
    address: address ? printed(address) : null,
  };
}

/**
 * A partner's address for a document: its default billing one for whoever
 * pays, or else any of its active addresses, the default first, oldest
 * next, so the choice is the same each time. Null when it has none.
 */
export async function partnerAddress(
  tx: Transaction,
  organizationId: string,
  partnerId: string,
  billing: boolean,
): Promise<PrintedAddress | null> {
  const [row] = await tx
    .select(PRINTED)
    .from(addresses)
    .where(
      and(
        eq(addresses.organizationId, organizationId),
        eq(addresses.partnerId, partnerId),
        eq(addresses.isActive, true),
      ),
    )
    .orderBy(
      ...(billing ? [desc(addresses.isBilling)] : []),
      desc(addresses.isDefault),
      asc(addresses.createdAt),
    )
    .limit(1);

  return row ?? null;
}

/** A site a document names, and its address while it has one. */
export interface PrintedSite {
  name: string;
  address: PrintedAddress | null;
}

export async function siteOf(
  tx: Transaction,
  organizationId: string,
  locationId: string | null,
): Promise<PrintedSite | null> {
  if (!locationId) return null;

  // The site's own address is its default one (ADR-071, amended).
  const [site] = await tx
    .select({ name: locations.name, address: PRINTED })
    .from(locations)
    .leftJoin(
      addresses,
      and(
        eq(addresses.organizationId, organizationId),
        eq(addresses.locationId, locations.id),
        eq(addresses.isDefault, true),
      ),
    )
    .where(
      and(
        eq(locations.organizationId, organizationId),
        eq(locations.id, locationId),
      ),
    );

  return site ?? null;
}

/**
 * Who raised a document, as it says so (ADR-071, amended): their name,
 * job title and work phone from their membership here. Never their email,
 * which may be personal, on a page that leaves the organization. Null for
 * someone no longer a member, whose name is not the organization's to
 * print.
 */
export interface RaisedBy {
  name: string;
  jobTitle: string | null;
  workPhone: string | null;
}

export async function raisedBy(
  tx: Transaction,
  organizationId: string,
  userId: string | null,
): Promise<RaisedBy | null> {
  if (!userId) return null;

  const [row] = await tx
    .select({
      name: users.name,
      jobTitle: memberships.jobTitle,
      workPhone: memberships.workPhone,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.userId, userId),
      ),
    );

  return row ?? null;
}
