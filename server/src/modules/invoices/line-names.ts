import { ConflictException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import type { DocumentLanguages } from '../../core/organizations/document-languages';
import type { Transaction } from '../../database/database.module';
import { organizations } from '../../database/schema';
import { t } from '../../i18n/translate';
import { itemName } from '../stock/item-name';

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
  product_name: string;
  variant_name: string | null;
  first_product: string | null;
  first_variant: string | null;
  second_product: string | null;
  second_variant: string | null;
};

/** "Simplified Chinese" rather than zh-Hans, for a refusal people read. */
const languageName = (tag: string) =>
  new Intl.DisplayNames(['en'], { type: 'language' }).of(tag) ?? tag;

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
 * fallback: a line whose product, or named variant, lacks a translation in
 * it is a 409 naming the SKU, before anything is written, as a missing
 * billing address is. Shipping never waits for this; issuing can, because
 * nothing has left the building on the strength of an invoice.
 */
export async function namedLines(
  tx: Transaction,
  organizationId: string,
  invoiceId: string,
  languages: DocumentLanguages,
): Promise<Map<string, LineNames>> {
  const rows = (
    await tx.execute<NameRow>(sql`
      select
        l.id,
        l.sku,
        p.name as product_name,
        v.name as variant_name,
        pt1.name as first_product,
        vt1.name as first_variant,
        pt2.name as second_product,
        vt2.name as second_variant
      from invoice_lines l
      join product_variants v on v.id = l.variant_id
      join products p on p.id = v.product_id
      left join product_translations pt1
        on pt1.product_id = p.id and pt1.locale = ${languages.language}
      left join variant_translations vt1
        on vt1.variant_id = v.id and vt1.locale = ${languages.language}
      left join product_translations pt2
        on pt2.product_id = p.id and pt2.locale = ${languages.secondLanguage}
      left join variant_translations vt2
        on vt2.variant_id = v.id and vt2.locale = ${languages.secondLanguage}
      where l.organization_id = ${organizationId}::uuid
        and l.invoice_id = ${invoiceId}::uuid
      order by l.sku
    `)
  ).rows;

  const [organization] = await tx
    .select({ required: organizations.requiredNameLanguages })
    .from(organizations)
    .where(eq(organizations.id, organizationId));

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

  for (const slot of slots) {
    if (slot.language === null) continue;
    if (!organization?.required.includes(slot.language)) continue;

    const untranslated = rows.find(
      (row) =>
        row[slot.product] === null ||
        (row.variant_name !== null && row[slot.variant] === null),
    );

    if (untranslated) {
      throw new ConflictException(
        t(
          {
            id: 'invoices.skuLanguageNameWhich',
            defaultMessage:
              '{sku} has no {language} name, which this organization requires on its documents',
          },
          { sku: untranslated.sku, language: languageName(slot.language) },
        ),
      );
    }
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
