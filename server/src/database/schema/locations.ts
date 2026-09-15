import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';
import { partners } from './partners';

/**
 * Five levels, and no more without a migration. A type nobody uses is noise,
 * and `pallet` is deliberately absent — a pallet moves, and putting a movable
 * thing in a fixed tree is how the tree stops meaning anything.
 */
export const LOCATION_TYPES = [
  'site', // a building or address — a warehouse, an office, a shop, a 3PL
  'zone',
  'aisle',
  'shelf',
  'bin',
] as const;

export type LocationType = (typeof LOCATION_TYPES)[number];

/**
 * One table for warehouses, zones, aisles, shelves, and bins. They need the
 * same things — a name, a parent, a status — and separate tables would force
 * `stock.location_id` to reference one of several, which is the problem
 * ADR-023 avoided by putting stock only on variants.
 *
 * `type` is a label, not a rule. It does not enforce depth (nothing here stops
 * a bin under a bin) and it does not determine leaf-ness. A leaf is a location
 * with no children, computed — which is what lets a small operation put stock
 * directly in a warehouse and add bins later without a migration.
 */
export const locations = pgTable(
  'locations',
  {
    id: primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      // ADR-012: the org owns its layout.
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /**
     * The whole hierarchy, in one nullable column. Null means top level.
     *
     * RESTRICT, not CASCADE: deleting a warehouse must not silently delete
     * every bin under it along with whatever those bins were holding.
     */
    parentId: uuid('parent_id').references((): AnyPgColumn => locations.id, {
      onDelete: 'restrict',
    }),

    type: text('type').notNull(),

    name: text('name').notNull(),

    /** What is printed on the label — "H5", "A-01-03". Typed, not generated. */
    code: text('code'),

    /**
     * Set when this site belongs to someone else — a contract manufacturer, a
     * 3PL. Our stock still sits here and is still ours (ADR-030); only the
     * building is theirs.
     *
     * RESTRICT: a partner holding our material is not deletable while it does.
     */
    partnerId: uuid('partner_id').references(() => partners.id, {
      onDelete: 'restrict',
    }),

    /**
     * False for Quarantine, Returns, and WIP.
     *
     * Those are locations, not a status on the stock row: a status does not
     * say where the units physically are, and changing one leaves no trace,
     * while moving stock is a movement with an actor and a reason. Warehouse
     * totals still include them, because an auditor counting the shelves will
     * find them; availability queries filter on this.
     *
     * Named `is_available` rather than `is_sellable` because raw materials are
     * consumed rather than sold.
     */
    isAvailable: boolean('is_available').notNull().default(true),

    isActive: boolean('is_active').notNull().default(true),

    ...timestamps,
  },
  (t) => [
    check(
      'locations_type_check',
      sql`${t.type} in ('site', 'zone', 'aisle', 'shelf', 'bin')`,
    ),
    // A location cannot contain itself. Deeper cycles are not expressible in a
    // check constraint and are prevented in the service.
    check('locations_no_self_parent_check', sql`${t.id} <> ${t.parentId}`),
    /**
     * Only a site can belong to a partner. A bin inside their building is
     * still just a bin — hanging the relationship off every level would let
     * two rows in one branch disagree about whose site it is.
     */
    check(
      'locations_partner_is_site_check',
      sql`${t.partnerId} is null or ${t.type} = 'site'`,
    ),

    // Codes are unique within their parent: Bin 5 in two different aisles is
    // two bins, and printing "5" on both labels is normal.
    uniqueIndex('locations_org_parent_code_key')
      .on(t.organizationId, t.parentId, t.code)
      .where(sql`${t.code} is not null and ${t.parentId} is not null`),

    // Top-level locations have no parent to scope by, so the organization is
    // the scope. Without this pair, parent_id being null made every root row
    // distinct and the constraint never fired for warehouses at all.
    uniqueIndex('locations_org_root_code_key')
      .on(t.organizationId, t.code)
      .where(sql`${t.code} is not null and ${t.parentId} is null`),

    index('locations_parent_id_idx').on(t.parentId),
    index('locations_organization_id_idx').on(t.organizationId),
    index('locations_partner_id_idx')
      .on(t.partnerId)
      .where(sql`${t.partnerId} is not null`),
  ],
);
