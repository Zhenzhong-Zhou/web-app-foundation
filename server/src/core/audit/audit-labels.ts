import { eq } from 'drizzle-orm';

import {
  boms,
  locations,
  lots,
  orders,
  partners,
  productionOrders,
  products,
  productVariants,
  stockMovements,
} from '../../database/schema';
import type { TenantDb } from '../../database/tenant-db.service';

type Resolver = (db: TenantDb, id: string) => Promise<string | undefined>;

/**
 * What an audited resource was called, read at the moment of the event
 * (ADR-038).
 *
 * Read after the handler, so an update records the name it was changed *to*
 * — which is what the row describes. The label is then frozen: a later
 * rename changes the record and never the history, and a record that is
 * deleted still has a name in the log.
 *
 * One entry per resource type rather than a call in every service: there are
 * forty-odd audited routes and nine types, and a lookup by primary key is a
 * single indexed read. Every query goes through TenantDb, so a mis-keyed id
 * finds nothing rather than another tenant's row.
 *
 * **No resolver for `user`, deliberately.** A member's name in a two-year
 * table outlives the anonymisation ADR-012 performs on the user row, and the
 * log would become the one place a deleted person is still named. User events
 * keep resolving through the actor join, which respects the tombstone.
 */
const RESOLVERS: Record<string, Resolver> = {
  product: async (db, id) => {
    const [row] = await db.select(products, eq(products.id, id));
    return row?.name;
  },

  partner: async (db, id) => {
    const [row] = await db.select(partners, eq(partners.id, id));
    return row && (row.code ? `${row.name} (${row.code})` : row.name);
  },

  location: async (db, id) => {
    const [row] = await db.select(locations, eq(locations.id, id));
    return row && (row.code ? `${row.name} (${row.code})` : row.name);
  },

  // The partner and the reference: how people say which order they mean.
  order: async (db, id) => {
    const [row] = await db.selectJoined(
      orders,
      partners,
      eq(partners.id, orders.partnerId),
      { partnerName: partners.name, reference: orders.reference },
      eq(orders.id, id),
    );
    return row && [row.partnerName, row.reference].filter(Boolean).join(' · ');
  },

  production_order: async (db, id) => {
    const [row] = await db.selectJoined(
      productionOrders,
      productVariants,
      eq(productVariants.id, productionOrders.outputVariantId),
      { sku: productVariants.sku, reference: productionOrders.reference },
      eq(productionOrders.id, id),
    );
    // The SKU alone reads the same for every run of a product; the reference
    // is what tells two of them apart in the log.
    return row && [row.sku, row.reference].filter(Boolean).join(' · ');
  },

  bom: async (db, id) => {
    const [row] = await db.selectJoined(
      boms,
      productVariants,
      eq(productVariants.id, boms.outputVariantId),
      { sku: productVariants.sku, version: boms.version },
      eq(boms.id, id),
    );
    return row && `${row.sku} v${row.version}`;
  },

  lot: async (db, id) => {
    const [row] = await db.selectJoined(
      lots,
      productVariants,
      eq(productVariants.id, lots.variantId),
      { sku: productVariants.sku, code: lots.code },
      eq(lots.id, id),
    );
    return row && `${row.sku} lot ${row.code}`;
  },

  // The SKU is copied onto the movement row already, so no join.
  stock_movement: async (db, id) => {
    const [row] = await db.select(stockMovements, eq(stockMovements.id, id));
    return row && `${row.sku} · ${row.reason}`;
  },
};

/**
 * Undefined when the type has no resolver, the row is gone, or the lookup
 * fails. A missing label costs a word in the log; it must never cost the
 * audit row, so this does not throw.
 */
export async function resolveLabel(
  db: TenantDb,
  type: string | undefined,
  id: string | undefined,
): Promise<string | undefined> {
  if (!type || !id) return undefined;

  const resolver = RESOLVERS[type];
  if (!resolver) return undefined;

  try {
    return (await resolver(db, id)) ?? undefined;
  } catch {
    return undefined;
  }
}
