import { ConflictException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import type { Locale } from '../../common/locales';
import type { DocumentLanguages } from '../../core/organizations/document-languages';
import type { Transaction } from '../../database/database.module';
import { organizations } from '../../database/schema';
import { languageName, t } from '../../i18n/translate';
import { itemName } from '../stock/item-name';

/** How the organization's documents count an item's names. */
export interface NameRules {
  /** The languages its documents require a name in. */
  required: Locale[];
  /** The language its items are named in, null while not set. */
  productNameLanguage: Locale | null;
}

/**
 * Read with no lock, after the names they judge. A choice of the items'
 * language that commits between the two reads leaves those names right:
 * it removes only names kept in that language, which from then on the own
 * names meet.
 */
export async function nameRulesOf(
  tx: Transaction,
  organizationId: string,
): Promise<NameRules> {
  const [organization] = await tx
    .select({
      required: organizations.requiredNameLanguages,
      productNameLanguage: organizations.productNameLanguage,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return organization ?? { required: [], productNameLanguage: null };
}

/** A name a document prints, with those kept for it in other languages. */
export interface KeptNames {
  kept: Partial<Record<Locale, string | null>>;
}

/**
 * What documents will refuse to print (ADR-054, amended by ADR-092 and for
 * #531). This one rule serves issuing and the item's page (#551's 65).
 * It returns each of `names` that has no name kept in a language of
 * `languages` the organization requires. The language its items are named
 * in is left out, since there each item's own name is its name. The result
 * is ordered by language, then as `names` are.
 */
export function missingNames<Name extends KeptNames>(
  names: readonly Name[],
  languages: readonly Locale[],
  rules: NameRules,
): { name: Name; locale: Locale }[] {
  return languages
    .filter(
      (locale) =>
        rules.required.includes(locale) && locale !== rules.productNameLanguage,
    )
    .flatMap((locale) =>
      names
        .filter((name) => !name.kept[locale])
        .map((name) => ({ name, locale })),
    );
}

/** What an issued line prints, in the invoice's one or two languages. */
export interface LineNames {
  description: string;
  secondDescription: string | null;
}

/**
 * A type rather than an interface: tx.execute wants a row type that fits
 * Record<string, unknown>, and only a type alias gets the implicit index
 * signature that allows.
 */
type NameRow = {
  id: string;
  sku: string;
  product_id: string;
  product_name: string;
  variant_name: string | null;
  first_product: string | null;
  first_variant: string | null;
  second_product: string | null;
  second_variant: string | null;
};

/**
 * Each line's name in the invoice's languages (ADR-054), checked against
 * what the organization requires, for issuing to write.
 *
 * A name in a language is that language's translation, else the base name;
 * a variant's part likewise, and only when the variant has a name at all.
 * The second is null when there is no second language, or when it comes
 * out the same as the first: printed once, not twice.
 *
 * A language the organization requires (required_name_languages) has no
 * fallback, except the one its items are named in, which the own names
 * meet (missingNames). A line whose product, or named variant, lacks a
 * translation in any other is a 409 before anything is written, as a
 * missing billing address is, naming whether the product's name or the
 * variation's is missing, the variation by its code and its own name
 * (ADR-054, amended by ADR-092); the product's first, since every
 * variation prints it. The refusal carries
 * item_name_missing and the item's id either way, for a page to open the
 * item, where its names are (ADR-071, amended). Shipping never waits for
 * this; issuing can, because nothing has left the building on the strength
 * of an invoice.
 */
export async function namedLines(
  tx: Transaction,
  organizationId: string,
  parentId: string,
  languages: DocumentLanguages,
  /**
   * Whose lines: an invoice's, or an order's, which the pro forma, the
   * purchase order and the RMA print (ADR-071). By the id given either way.
   */
  of: 'invoice' | 'order' = 'invoice',
  /**
   * Only these of its lines, when the document prints only some: an RMA
   * names the order lines it returns, and a missing name on any other is
   * not its to refuse.
   */
  only?: string[],
): Promise<Map<string, LineNames>> {
  const lines = sql.raw(of === 'order' ? 'order_lines' : 'invoice_lines');
  const parent = sql.raw(of === 'order' ? 'order_id' : 'invoice_id');
  const just = only
    ? sql`and l.id in (${sql.join(
        only.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`
    : sql``;

  const rows = (
    await tx.execute<NameRow>(sql`
      select
        l.id,
        l.sku,
        p.id as product_id,
        p.name as product_name,
        v.name as variant_name,
        pt1.name as first_product,
        vt1.name as first_variant,
        pt2.name as second_product,
        vt2.name as second_variant
      from ${lines} l
      join product_variants v
        on v.id = l.variant_id
        and v.organization_id = ${organizationId}::uuid
      join products p
        on p.id = v.product_id
        and p.organization_id = ${organizationId}::uuid
      left join product_translations pt1
        on pt1.product_id = p.id
        and pt1.organization_id = ${organizationId}::uuid
        and pt1.locale = ${languages.language}
      left join variant_translations vt1
        on vt1.variant_id = v.id
        and vt1.organization_id = ${organizationId}::uuid
        and vt1.locale = ${languages.language}
      left join product_translations pt2
        on pt2.product_id = p.id
        and pt2.organization_id = ${organizationId}::uuid
        and pt2.locale = ${languages.secondLanguage}
      left join variant_translations vt2
        on vt2.variant_id = v.id
        and vt2.organization_id = ${organizationId}::uuid
        and vt2.locale = ${languages.secondLanguage}
      where l.organization_id = ${organizationId}::uuid
        and l.${parent} = ${parentId}::uuid
        ${just}
      order by l.sku
    `)
  ).rows;

  const slots = [
    {
      language: languages.language,
      product: 'first_product',
      variant: 'first_variant',
    },
    {
      language: languages.secondLanguage,
      product: 'second_product',
      variant: 'second_variant',
    },
  ] as const;

  // The slots that hold a language: the second only when there is one.
  const filled = slots.flatMap(({ language, ...slot }) =>
    language === null ? [] : [{ language, ...slot }],
  );
  const keptIn = (row: NameRow, part: 'product' | 'variant') =>
    Object.fromEntries(filled.map((slot) => [slot.language, row[slot[part]]]));

  const [missing] = missingNames(
    rows.flatMap((row) => [
      { row, which: 'product', kept: keptIn(row, 'product') } as const,
      ...(row.variant_name === null
        ? []
        : [{ row, which: 'variant', kept: keptIn(row, 'variant') } as const]),
    ]),
    filled.map((slot) => slot.language),
    // Read after the names, for nameRulesOf's reason.
    await nameRulesOf(tx, organizationId),
  );

  if (missing) {
    const { row, which } = missing.name;
    throw new ConflictException(
      withCode(
        t(
          {
            id: 'invoices.skuLanguageNameWhich',
            defaultMessage:
              '{which, select, variant {The variant {sku} ({variation}) of {product}} other {{product} ({sku})}} has no {language} name, which this organization requires on its documents. Add it on the item’s page, under Names in other languages.',
          },
          {
            which,
            sku: row.sku,
            product: row.product_name,
            variation: row.variant_name ?? '',
            // In the reader's language, as the item's page names it.
            language: languageName(missing.locale),
          },
        ),
        ERROR_CODES.itemNameMissing,
        { productId: row.product_id },
      ),
    );
  }

  const nameIn = (row: NameRow, slot: (typeof slots)[number]) =>
    itemName(
      row[slot.product] ?? row.product_name,
      row.variant_name === null
        ? null
        : (row[slot.variant] ?? row.variant_name),
    );

  return new Map(
    rows.map((row) => {
      const description = nameIn(row, slots[0]);
      const second =
        languages.secondLanguage === null ? null : nameIn(row, slots[1]);
      return [
        row.id,
        {
          description,
          secondDescription: second === description ? null : second,
        },
      ];
    }),
  );
}
