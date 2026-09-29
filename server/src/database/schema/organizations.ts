import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  char,
  check,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { priceLists } from './price-lists';

/**
 * The tenant root (ADR-003). Every tenant-scoped table points here.
 *
 * Deliberately has no created_by: organizations and users would then
 * reference each other, and the Owner membership already records who
 * created it.
 */
export const organizations = pgTable(
  'organizations',
  {
    id: primaryKey(),
    name: text('name').notNull(),
    // URL-safe identifier: /orgs/acme rather than /orgs/<uuid>
    slug: text('slug').notNull(),

    /**
     * GST/HST, VAT, ABN — whatever the country issues. Printed on every
     * invoice (ADR-046) and copied onto it at issue, so a change here never
     * rewrites a sent invoice. Nullable: not every organization is
     * registered, and none were before invoicing.
     */
    taxRegistrationNumber: text('tax_registration_number'),

    /**
     * ISO 4217: what this organization's stock is valued in (ADR-048).
     * Nullable and never defaulted — a default would assert a currency
     * nobody chose (ADR-035). Fixed once any valuation carries a value or a
     * rate; the service enforces that, since a check cannot see another
     * table.
     */
    baseCurrency: char('base_currency', { length: 3 }),

    /**
     * The sale list for customers with none of their own (ADR-049). No
     * purchase default: a supplier's price is specific to the supplier.
     */
    defaultSalePriceListId: uuid('default_sale_price_list_id').references(
      (): AnyPgColumn => priceLists.id,
      { onDelete: 'restrict' },
    ),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('organizations_slug_key').on(t.slug),

    check(
      'organizations_slug_format',
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    check(
      'organizations_tax_registration_number_not_blank_check',
      sql`${t.taxRegistrationNumber} is null or length(btrim(${t.taxRegistrationNumber})) > 0`,
    ),
    check(
      'organizations_base_currency_format_check',
      sql`${t.baseCurrency} is null or ${t.baseCurrency} ~ '^[A-Z]{3}$'`,
    ),
  ],
);
