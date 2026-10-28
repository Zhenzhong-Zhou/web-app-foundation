import { or, type SQL, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import {
  bestRank,
  codeMatches,
  matchRank,
  nameMatches,
  pinyinMatches,
  pinyinRank,
  type SearchTerms,
} from '../../common/search';
import {
  products,
  productTranslations,
  productVariants,
  variantTranslations,
} from '../../database/schema';
import { namesIn } from '../stock/item-name';

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

/**
 * How closely an item matches, for ORDER BY, lowest first (ADR-056): exact,
 * then at the start, then anywhere, on its SKU, its product's name as the
 * reader sees it and as stored, and the pinyin of each. A reader in Chinese
 * who types 专注胶囊 or zhuanzhujiaonang has the product of that name first,
 * not among every name it is part of. For the same query as itemMatches;
 * the lookup, the pickers and Products rank by it.
 */
export function itemRank(
  terms: SearchTerms,
  locale: Locale,
  organizationId: string,
): SQL {
  const shownPinyin = sql`(
    select pt.name_pinyin from product_translations pt
    where pt.product_id = ${products.id}
      and pt.locale = ${locale}
      and pt.organization_id = ${organizationId}::uuid
  )`;

  return bestRank(
    matchRank(productVariants.sku, terms),
    matchRank(namesIn(locale, organizationId).productName, terms, 'name'),
    matchRank(products.name, terms, 'name'),
    pinyinRank(shownPinyin, terms),
    pinyinRank(products.namePinyin, terms),
  );
}
