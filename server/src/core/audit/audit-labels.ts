import { eq } from 'drizzle-orm';

import {
  boms,
  creditNotes,
  exchangeRates,
  invoices,
  locations,
  lots,
  orderLines,
  orderReturns,
  orders,
  organizations,
  partners,
  priceLists,
  productionOrders,
  productLicences,
  products,
  productVariants,
  returnAuthorizations,
  roles,
  shipments,
  stockMovements,
  stockValuations,
  taxCodes,
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
 * forty-odd audited routes and about a dozen types, and a lookup by primary key is a
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

  // Its number and its partner: how people say which order they mean.
  order: async (db, id) => {
    const [row] = await db.selectJoined(
      orders,
      partners,
      eq(partners.id, orders.partnerId),
      { number: orders.number, partnerName: partners.name },
      eq(orders.id, id),
    );
    return row && `${row.number} · ${row.partnerName}`;
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

  product_licence: async (db, id) => {
    const [row] = await db.select(productLicences, eq(productLicences.id, id));
    return row && `${row.authority} ${row.number}`;
  },

  tax_code: async (db, id) => {
    const [row] = await db.select(taxCodes, eq(taxCodes.id, id));
    return row?.name;
  },

  // The customer and the number; before it has one, the customer alone.
  // A label holds no words (ADR-076): the action already says "draft".
  invoice: async (db, id) => {
    const [row] = await db.selectJoined(
      invoices,
      partners,
      eq(partners.id, invoices.partnerId),
      { partnerName: partners.name, number: invoices.number },
      eq(invoices.id, id),
    );
    return row && [row.partnerName, row.number].filter(Boolean).join(' · ');
  },

  // The customer and the number, as an invoice is named.
  credit_note: async (db, id) => {
    const [row] = await db.selectJoined(
      creditNotes,
      partners,
      eq(partners.id, creditNotes.partnerId),
      { partnerName: partners.name, number: creditNotes.number },
      eq(creditNotes.id, id),
    );
    return row && `${row.partnerName} · ${row.number}`;
  },

  // The customer and the number, as an invoice is named.
  return_authorization: async (db, id) => {
    const [row] = await db.selectJoined(
      returnAuthorizations,
      partners,
      eq(partners.id, returnAuthorizations.partnerId),
      { partnerName: partners.name, number: returnAuthorizations.number },
      eq(returnAuthorizations.id, id),
    );
    return row && `${row.partnerName} · ${row.number}`;
  },

  /**
   * organizations is the tenant root and has no organization_id, so
   * TenantDb.select cannot scope it. The transaction hands over the
   * session's own id, and the id check means a mis-keyed row finds nothing.
   */
  organization: async (db, id) =>
    db.transaction(async (tx, organizationId) => {
      if (id !== organizationId) return undefined;

      const [row] = await tx
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, organizationId));
      return row?.name;
    }),

  lot: async (db, id) => {
    const [row] = await db.selectJoined(
      lots,
      productVariants,
      eq(productVariants.id, lots.variantId),
      { sku: productVariants.sku, code: lots.code },
      eq(lots.id, id),
    );
    return row && `${row.sku} · ${row.code}`;
  },

  // The SKU is copied onto the movement row already, so no join. Its
  // reason is a code, recorded in the payload to be read in words.
  stock_movement: async (db, id) => {
    const [row] = await db.select(stockMovements, eq(stockMovements.id, id));
    return row?.sku;
  },

  // The item a cost was set on.
  stock_valuation: async (db, id) => {
    const [row] = await db.selectJoined(
      stockValuations,
      productVariants,
      eq(productVariants.id, stockValuations.variantId),
      { sku: productVariants.sku },
      eq(stockValuations.id, id),
    );
    return row?.sku;
  },

  exchange_rate: async (db, id) => {
    const [row] = await db.select(exchangeRates, eq(exchangeRates.id, id));
    // The day is in the payload, read as a day in the reader's language.
    return row?.currency;
  },

  price_list: async (db, id) => {
    const [row] = await db.select(priceLists, eq(priceLists.id, id));
    return row?.name;
  },

  /*
   * Kinds named only as references inside a payload (ADR-076), never as
   * the record a row is about.
   */

  // A system role's name is a key the reader's language words.
  role: async (db, id) => {
    const [row] = await db.select(roles, eq(roles.id, id));
    return row?.name;
  },

  variant: async (db, id) => {
    const [row] = await db.select(productVariants, eq(productVariants.id, id));
    return row?.sku;
  },

  order_line: async (db, id) => {
    const [row] = await db.select(orderLines, eq(orderLines.id, id));
    return row?.sku;
  },

  // A return received against an order: the order's number.
  order_return: async (db, id) => {
    const [row] = await db.selectJoined(
      orderReturns,
      orders,
      eq(orders.id, orderReturns.orderId),
      { number: orders.number },
      eq(orderReturns.id, id),
    );
    return row?.number;
  },
};

/**
 * A shipment: its order's number, and the tracking number when there is
 * one; and its order's id, since a shipment has no page and links to its
 * order (ADR-076). Outside RESOLVERS, which give a name alone: a reference
 * to a shipment keeps both. Undefined, never a throw, as resolveLabel.
 */
export async function resolveShipment(
  db: TenantDb,
  id: string,
): Promise<{ label: string; orderId: string } | undefined> {
  try {
    const [row] = await db.selectJoined(
      shipments,
      orders,
      eq(orders.id, shipments.orderId),
      {
        orderId: orders.id,
        number: orders.number,
        tracking: shipments.trackingNumber,
      },
      eq(shipments.id, id),
    );
    return (
      row && {
        label: [row.number, row.tracking].filter(Boolean).join(' · '),
        orderId: row.orderId,
      }
    );
  } catch {
    return undefined;
  }
}

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
