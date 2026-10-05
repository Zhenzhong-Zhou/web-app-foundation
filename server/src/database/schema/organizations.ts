import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  char,
  check,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { Locale } from '../../common/locales';
import {
  isCurrencyCode,
  languagesDiffer,
  primaryKey,
  timestamps,
} from './columns';
import { priceLists } from './price-lists';

/**
 * What release does with a licence in a given state (ADR-050): refuse it,
 * refuse it unless someone holding production.override_licence gives a
 * reason, or let it through. Named here, beside the check constraints that
 * hold the same list, as every status vocabulary is.
 */
export const LICENCE_POLICIES = ['block', 'override', 'allow'] as const;

export type LicencePolicy = (typeof LICENCE_POLICIES)[number];

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

    /**
     * What release does with the licence on a run's recipe (ADR-050). A
     * policy per organization because no one rule fits: an NPN never
     * expires, an export certificate does, and whether work may go on while
     * a renewal is pending depends on the regime.
     *
     * Each is block (refused), override (refused unless someone holding
     * production.override_licence gives a reason) or allow. Withdrawn has no
     * column: it is always refused, because withdrawal is a decision
     * somebody made and an override would undo it without saying so.
     *
     * The defaults are the cautious reading of a regime nobody has
     * configured: a licence not yet in force is not a licence yet, and an
     * expired one usually means a renewal filed but not yet granted.
     */
    licenceNotInForcePolicy: text('licence_not_in_force_policy')
      .$type<LicencePolicy>()
      .notNull()
      .default('block'),
    licenceExpiredPolicy: text('licence_expired_policy')
      .$type<LicencePolicy>()
      .notNull()
      .default('override'),

    /**
     * Whether a recipe must carry a licence to be released. Off by default,
     * so a business making nothing regulated never meets any of this. When
     * on, a recipe with none is refused outright, with no override: making
     * an unregistered product is not a lapse someone can sign off.
     */
    licenceRequired: boolean('licence_required').notNull().default(false),

    /**
     * What this organization's documents print in, for partners with no
     * choice of their own (ADR-054): one language, or two for a bilingual
     * sheet — French with English, Chinese with English. English until
     * someone chooses, since every document before ADR-054 was English.
     */
    documentLanguage: text('document_language')
      .$type<Locale>()
      .notNull()
      .default('en'),
    documentSecondLanguage: text('document_second_language').$type<Locale>(),

    /**
     * The languages every product must also be named in (ADR-054): issuing
     * an invoice in one of them with an untranslated product is refused.
     * Empty requires nothing, which is where an organization starts.
     */
    requiredNameLanguages: text('required_name_languages')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

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
      sql`${t.baseCurrency} is null or ${isCurrencyCode(t.baseCurrency)}`,
    ),
    check(
      'organizations_licence_not_in_force_policy_check',
      sql`${t.licenceNotInForcePolicy} in ('block', 'override', 'allow')`,
    ),
    check(
      'organizations_licence_expired_policy_check',
      sql`${t.licenceExpiredPolicy} in ('block', 'override', 'allow')`,
    ),
    // No needs-first check: the first language is never null here.
    check(
      'organizations_document_languages_differ_check',
      languagesDiffer(t.documentLanguage, t.documentSecondLanguage),
    ),
  ],
);
