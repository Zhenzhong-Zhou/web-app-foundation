---
paths:
  - "server/src/modules/products/**"
  - "server/src/modules/stock/{item-name,item-stock}.ts"
  - "server/src/database/schema/{products,product-categories,product-variants,product-translations,variant-translations,product-images}.ts"
  - "client/src/products/**"
  - "client/src/components/{variant-picker,product-cover}*.tsx"
  - "client/src/lib/{use-variants,use-picker-search}.ts"
  - "server/test/{products,product-categories,product-images,item-names,whole-list-search,items-list}.e2e-spec.ts"
  - "client/e2e/{products,product-detail,product-images}.spec.ts"
---

# Products: the code rules, for Claude

It loads when Claude reads, writes or edits a file its `paths` match.

What products allow, refuse and work out is in
[`docs/rules/products.md`](../../docs/rules/products.md), for people; a
commit that changes one of those rules updates it (ADR-087).

- **A product is added with its first variant, in one transaction;** the
  SKU, unit, lot tracking and stock live on the variant (ADR-023).
- **A SKU is unique by its index,** `product_variants_org_sku_key`: a
  unique violation becomes `codeInUse`'s 409, naming the item that holds
  it, and a SKU change records the old one with `recordPrevious`.
- **An item's name for a person comes from `namesIn`** in
  `stock/item-name.ts`, the locale from `@AcceptLanguage()` through
  `localeOf`, a list's order from `productNameOrder`; documents, CSV and
  History read the base. A read that fills an edit form keeps the base
  `name` beside `displayName`. A new read that names an item goes in
  `NAMED_READS` or `KEEP_THE_BASE` in `item-names.e2e-spec.ts`, which
  fails until it does (ADR-056, amended).
- **Every write of a name writes its pinyin,** `namePinyin()` on an insert
  and `pinyinOf()` on an update, items' and categories' (ADR-056, ADR-092).
- **An item is matched and ranked by `itemMatches` and `itemRank`**
  (`item-search.ts`); nothing matches in the browser (ADR-056, amended).
- **Every join and subquery to products, variants or their translations
  names the organization,** the correlated ones too (ADR-003, ADR-056).
- **Items' list orders by `itemOrder`'s parts, its cursor holding them**
  (`item-list.ts`); a row's stock and status are `itemStock` and
  `itemStockStatus` (`stock/item-stock.ts`), read for its page (ADR-092).
- **A cover is `coverOf()`,** its product named by its table; a gallery
  change locks the product with `lockProduct` and keeps the positions 0
  to n − 1, at most `MAX_PRODUCT_IMAGES` (ADR-062, ADR-066).
- **Every item picker is `VariantPicker`,** its catalogue from
  `useVariants`, read when its dialog or page opens, its `loading` the
  hook's `!answered`; Products' search is `useListSearch` (ADR-056,
  amended).
- **Other-language names are replaced as a set,** `recordContext({ names })`.
- **Category writes take `lockTree` first** (`category-tree.ts`, ADR-092);
  `changeMany` writes each item's History row itself, in its transaction.
