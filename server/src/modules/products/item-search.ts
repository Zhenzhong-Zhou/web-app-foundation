import { or, type SQL, sql } from 'drizzle-orm';

import {
  codeMatches,
  nameMatches,
  pinyinMatches,
  type SearchTerms,
} from '../../common/search';
import {
  products,
  productTranslations,
  productVariants,
  variantTranslations,
} from '../../database/schema';

/**
 * Whether an item matches a search (ADR-056): its SKU, its product's and its
 * variant's name in every language they have, and the pinyin of each. For a
 * query over product_variants joined to products; the translations are
 * reached through EXISTS, so a product with names in three languages is
 * still one row.
 */
export function itemMatches(terms: SearchTerms): SQL {
  const translatedProduct = or(
    nameMatches(productTranslations.name, terms),
    pinyinMatches(productTranslations.namePinyin, terms),
  );
  const translatedVariant = or(
    nameMatches(variantTranslations.name, terms),
    pinyinMatches(variantTranslations.namePinyin, terms),
  );

  return or(
    codeMatches(productVariants.sku, terms),
    nameMatches(products.name, terms),
    nameMatches(productVariants.name, terms),
    pinyinMatches(products.namePinyin, terms),
    pinyinMatches(productVariants.namePinyin, terms),
    sql`exists (
      select 1 from ${productTranslations}
      where ${productTranslations.productId} = ${products.id}
        and (${translatedProduct})
    )`,
    sql`exists (
      select 1 from ${variantTranslations}
      where ${variantTranslations.variantId} = ${productVariants.id}
        and (${translatedVariant})
    )`,
  )!;
}
