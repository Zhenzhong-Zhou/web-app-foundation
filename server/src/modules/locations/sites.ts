import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { locations } from '../../database/schema';
import { t } from '../../i18n/translate';
import type { Tx } from '../stock/stock.service';

/**
 * Choosing a site for a document (ADR-071, amended): where a purchase is
 * delivered and where an RMA's goods come back. Functions rather than a
 * service, as loadOrder is: orders and RMAs each call them inside their own
 * transaction, and neither module should depend on the other's.
 */

/**
 * A site sent in a body, checked before anything is written: this
 * organization's (400 otherwise, so another tenant's id reads as unknown),
 * a site rather than a place inside one (400), and still in use (409).
 */
export async function assertSite(
  tx: Tx,
  organizationId: string,
  locationId: string,
): Promise<void> {
  const [site] = await tx
    .select({
      name: locations.name,
      type: locations.type,
      isActive: locations.isActive,
    })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, organizationId),
        eq(locations.id, locationId),
      ),
    );

  if (!site) {
    throw new BadRequestException(
      t({ id: 'locations.site.unknown', defaultMessage: 'Unknown site' }),
    );
  }

  if (site.type !== 'site') {
    throw new BadRequestException(
      t(
        {
          id: 'locations.site.notSite',
          defaultMessage:
            '{name} is not a site. Choose the building the goods go to.',
        },
        { name: site.name },
      ),
    );
  }

  if (!site.isActive) {
    throw new ConflictException(
      t(
        {
          id: 'locations.site.retired',
          defaultMessage:
            '{name} is retired. Choose a site still in use, or put it back in use in Locations.',
        },
        { name: site.name },
      ),
    );
  }
}

/**
 * The organization's one active site, or null when it has none or
 * several: what a document is given when nobody chose. With several,
 * guessing would send goods to the wrong building.
 */
export async function onlySite(
  tx: Tx,
  organizationId: string,
): Promise<string | null> {
  const sites = await tx
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, organizationId),
        eq(locations.type, 'site'),
        eq(locations.isActive, true),
      ),
    )
    .limit(2);

  return sites.length === 1 ? sites[0].id : null;
}

/**
 * A site chosen earlier, carried onto a new document while it is still an
 * active site; null once it is retired, for the caller to choose again.
 */
export async function siteStillInUse(
  tx: Tx,
  organizationId: string,
  locationId: string | null,
): Promise<string | null> {
  if (!locationId) return null;

  const [site] = await tx
    .select({ id: locations.id })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, organizationId),
        eq(locations.id, locationId),
        eq(locations.type, 'site'),
        eq(locations.isActive, true),
      ),
    );

  return site?.id ?? null;
}

/**
 * The site an order's goods last left from: the nearest site at or above
 * the location of its latest shipment that still stands, when that site is
 * still in use. Null when nothing shipped, or nothing above it is a site.
 *
 * Raw SQL with every table aliased, since the walk up the tree refers to
 * its own rows (handoff, Server).
 */
export async function siteShippedFrom(
  tx: Tx,
  organizationId: string,
  orderId: string,
): Promise<string | null> {
  const result = await tx.execute<{ id: string; is_active: boolean }>(sql`
    with recursive up (id, parent_id, type, is_active, depth) as (
      select l.id, l.parent_id, l.type, l.is_active, 0
      from locations l
      where l.id = (
        select s.from_location_id
        from shipments s
        where s.organization_id = ${organizationId}::uuid
          and s.order_id = ${orderId}::uuid
          and s.voided_at is null
        order by s.created_at desc, s.id desc
        limit 1
      )
      union all
      select p.id, p.parent_id, p.type, p.is_active, up.depth + 1
      from up
      join locations p on p.id = up.parent_id
      where up.type <> 'site' and up.depth < 10
    )
    select up.id, up.is_active
    from up
    where up.type = 'site'
    order by up.depth
    limit 1
  `);

  const [site] = result.rows;
  return site?.is_active ? site.id : null;
}

/**
 * A location of this organization that may have an address: a site. Not
 * found is a 404, so another organization's id reads as no such location;
 * a zone, an aisle, a shelf or a bin is a 400, being at its site's.
 */
export async function assertAddressable(
  tx: Tx,
  organizationId: string,
  locationId: string,
): Promise<void> {
  const [site] = await tx
    .select({ type: locations.type })
    .from(locations)
    .where(
      and(
        eq(locations.organizationId, organizationId),
        eq(locations.id, locationId),
      ),
    );
  if (!site) {
    throw new NotFoundException(
      t({
        id: 'locations.suchLocation',
        defaultMessage: 'No such location',
      }),
    );
  }
  if (site.type !== 'site') {
    throw new BadRequestException(
      t({
        id: 'locations.addressOnSite',
        defaultMessage:
          'Only a site has an address; the places inside it share it',
      }),
    );
  }
}
