# Products

What the app allows, refuses and works out for products and their
variants, their categories, their names in other languages, the name each
reader sees, the Products list's search and the item pickers, product
images and the catalogue export, as the code does it today. Each rule links the ADR that
decided it, the test that proves it, the Help section where a person
meets it, and the manual check that walks it by hand. Why a rule is so is
in its ADR; how to do a task is in the
[Help guide](../../client/src/help/guides/en/products.md). How a search
matches, in every box that searches, is the search area's rules file's.
How this file is kept is in the [README](README.md).

## Adding a product

- **Every product has at least one variant, the thing stock is counted
  in, and the two are added together.** A product with no sizes has one
  variant with no name of its own, behind the one SKU field. If the
  variant is refused, the product is not added either.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#every-product-has-at-least-one-variant-including-those-with-no-variation) ·
  [test](../../server/test/products.e2e-spec.ts) "creates the product and its first variant together" ·
  [test](../../server/test/products.e2e-spec.ts) "creates a variant even when the product has no variation" ·
  [test](../../server/test/products.e2e-spec.ts) "rejects a product with no variant" ·
  [test](../../server/test/products.e2e-spec.ts) "rejects a duplicate SKU and leaves no orphaned product" ·
  [test](../../client/e2e/products.spec.ts) "creates a product through the form and shows it in the table" ·
  [Help](../../client/src/help/guides/en/products.md#add-a-product-add) ·
  MC-201
- **An item's type says what it is for, one of six: products, raw
  materials, packaging, supplies, samples or equipment. It is chosen when
  the item is added and may change at any time,** since it changes
  nothing else: the item moves to that type's tab, and its stock, lots and
  History stay. History records the type from and to.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#decision--type-distinguishes-what-a-thing-is-for-and-does-not-fork-the-schema) ·
  [ADR-092](../adr/0092-items.md#decision--adding-and-changing-an-item-by-its-type) ·
  [test](../../server/test/products.e2e-spec.ts) "rejects an unknown type" ·
  [test](../../server/test/products.e2e-spec.ts) "changes its type, which History records from and to, as Discontinue" ·
  [test](../../client/e2e/products.spec.ts) "shows a product that already exists in the organisation" ·
  [Help](../../client/src/help/guides/en/products.md#add-a-product-add) ·
  MC-201
- **A product needs a name, up to 200 characters, and may have a
  description, up to 2,000. Two products may share a name:** the SKU tells
  them apart. Spaces around the name are dropped.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#decision--products-group-variants-carry-stock) ·
  no test ·
  [Help](../../client/src/help/guides/en/products.md#add-a-product-add)
- **A product's name and description are set when it is added: no screen
  changes them afterwards,** though the API accepts new ones. Its names in
  other languages, and its variants' names, are changed on its page.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#decision--products-group-variants-carry-stock) ·
  [test](../../server/test/audit.e2e-spec.ts) "names the resource as it was at the time" ·
  partly tested
- **A SKU is typed, never made up by the app, up to 64 characters, and is
  unique within the organization: a second variant with the same SKU, on
  any item, is refused, naming the code and the item that has it, by its
  base name, and asking for another code.** Another organization may use
  the same SKU, and nothing says so. Spaces around a SKU are dropped.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#decision--skus-are-unique-per-organization-never-global-never-generated) ·
  [ADR-092](../adr/0092-items.md#decision--adding-and-changing-an-item-by-its-type) ·
  [test](../../server/test/products.e2e-spec.ts) "rejects a duplicate SKU and leaves no orphaned product" ·
  [test](../../server/test/products.e2e-spec.ts) "refuses a code in use, naming the item that has it and asking for another" ·
  [test](../../server/test/products.e2e-spec.ts) "refuses a SKU already used elsewhere in the organization" ·
  [test](../../server/test/products.e2e-spec.ts) "allows the same SKU in another organization" ·
  [Help](../../client/src/help/guides/en/products.md#if-something-is-refused-refused)
- **Lot tracking is chosen when a variant is added, off unless turned on,
  and never changes after.** Turned on or off for a variant that holds
  stock, its stock would be half with lots and half without.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#decision--batch-tracking-is-a-property-of-the-variant-not-a-global-mode) ·
  [test](../../server/test/products.e2e-spec.ts) "rejects tracksLots in an update" ·
  [test](../../server/test/products.e2e-spec.ts) "creates a variant even when the product has no variation" ·
  [Help](../../client/src/help/guides/en/products.md#add-a-product-add)

## Variants

- **Add variant adds another size of the same product, with its own SKU,
  unit and lot tracking.** Its name, such as 60ct or Large, is optional,
  up to 100 characters.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#decision--products-group-variants-carry-stock) ·
  [test](../../server/test/products.e2e-spec.ts) "adds a second variant to an existing product" ·
  [test](../../client/e2e/product-detail.spec.ts) "adds a second variant to an existing product" ·
  [Help](../../client/src/help/guides/en/products.md#variants-images-and-names-variants)
- **A variant's unit is what its stock is counted in: each, unless
  another is chosen.** The screens offer each, kg, g, litre, ml, case, box
  and pallet, named in the reader's language; a unit stored any other way
  shows as it was stored. The unit can be changed at any time, and the
  quantities already held are not converted.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#consequence) ·
  [test](../../server/test/item-names.e2e-spec.ts) "keeps the base name where the product page edits it, for a reader in Chinese (4.2)" ·
  [test](../../client/src/products/units.test.ts) "takes the unit’s plural in English where it has one" ·
  [test](../../client/src/products/units.test.ts) "keeps one form in Chinese" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/products.md#variants-images-and-names-variants)
- **A SKU can be corrected at any time, and the old one is free again at
  once.** On the product's page the SKU is changed in its cell and saved on
  leaving the field. Orders and stock movements keep the SKU they were made
  with; History keeps the old and the new. A SKU already in use is refused,
  as when adding.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#decision--skus-are-unique-per-organization-never-global-never-generated) ·
  [test](../../server/test/products.e2e-spec.ts) "renames a SKU and frees the old one" ·
  [test](../../server/test/products.e2e-spec.ts) "refuses a code in use, naming the item that has it and asking for another" ·
  [test](../../server/test/audit.e2e-spec.ts) "records only the fields a route named" ·
  [test](../../server/test/orders.e2e-spec.ts) "creates the order and its lines together, snapshotting the SKU" ·
  [test](../../client/e2e/product-detail.spec.ts) "renames a SKU inline" ·
  partly tested ·
  MC-202
- **Edit records a variant's name, its unit, its weight in grams, its size
  in millimetres and how many ship in a case,** each number whole and
  above zero. A field emptied in Edit is not sent, so it keeps what it
  had.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#decision--products-group-variants-carry-stock) ·
  [test](../../client/e2e/product-detail.spec.ts) "edits a variant through the dialog" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/products.md#variants-images-and-names-variants) ·
  MC-2806

## Discontinuing

- **A product or a variant is discontinued, never deleted,** so its stock
  history stays whole. Nothing deletes either; Reactivate brings one back.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#decision--products-group-variants-carry-stock) ·
  [test](../../server/test/products.e2e-spec.ts) "discontinues without touching its variants" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/products.md#words-youll-meet-words)
- **Discontinuing a product leaves each variant's own status as it was,**
  so reactivating the product brings each variant back as it was.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#decision--products-group-variants-carry-stock) ·
  [test](../../server/test/products.e2e-spec.ts) "discontinues without touching its variants" ·
  [Help](../../client/src/help/guides/en/products.md#words-youll-meet-words)
- **An item is offered where an item is chosen only while both it and its
  product are active,** in every picker, typed or not.
  [ADR-023](../adr/0023-stock-lives-on-variants-and-quantity-is-a-ledger.md#decision--products-group-variants-carry-stock) ·
  [test](../../server/test/products.e2e-spec.ts) "hides a variant whose product was discontinued" ·
  [test](../../server/test/products.e2e-spec.ts) "hides a discontinued variant of an active product" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "leaves out a discontinued item, as it does without a search" ·
  [Help](../../client/src/help/guides/en/products.md#words-youll-meet-words)
- **The list of items hides discontinued ones unless asked: Discontinued
  shows them alone, and the top bar's Show all beside the rest; their
  count follows the search and the category.** Products asks for them
  beside the rest, marked Discontinued, and its Discontinued filter
  narrows the first fifty it reads and counts within them.
  [ADR-092](../adr/0092-items.md#decision--a-row-the-name-first-its-stock-read-from-inventory) ·
  [test](../../server/test/items-list.e2e-spec.ts) "hides discontinued items unless asked, then alone or beside the rest, and counts them" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a discontinued product when asked to include them, as the top bar does" ·
  partly tested ·
  MC-1546 · MC-3901

## Several at once

- **Whoever may change items changes up to 500 at once, each to its own
  category or none, or discontinued or brought back, all or none: an item
  or a category another organization keeps refuses the whole change, and
  so does an item sent twice.** The answer is each item's values before,
  so Undo sends it back. History records each item that changed, from and
  to, under its name; an item already as asked records nothing.
  [ADR-092](../adr/0092-items.md#decision--several-at-once-with-undo) ·
  [test](../../server/test/products.e2e-spec.ts) "moves several items to a category, each recorded, and Undo sends the answer back" ·
  [test](../../server/test/products.e2e-spec.ts) "discontinues several at once, and Undo brings each back as it was" ·
  [test](../../server/test/products.e2e-spec.ts) "refuses the whole request for another organization’s item or category, changing nothing" ·
  [test](../../server/test/products.e2e-spec.ts) "refuses more than 500 items, one twice, and whoever may not change items"

## The list of items

- **The list reads fifty items at a time unless asked for fewer, each
  page after the last by its cursor, every item once however many share
  a name; the counts come with the first page.** A cursor made for
  another sort, direction or language is refused.
  [ADR-092](../adr/0092-items.md#decision--fifty-at-a-time-the-counts-from-the-server) ·
  [test](../../server/test/items-list.e2e-spec.ts) "pages by its cursor, each row once, the counts with the first page alone" ·
  [test](../../server/test/items-list.e2e-spec.ts) "keeps two items of one name apart across a page’s edge" ·
  [test](../../server/test/items-list.e2e-spec.ts) "refuses a cursor made for another order, or not made here"
- **It narrows to one type, to a category with every category under it,
  or to the Uncategorised.**
  [ADR-092](../adr/0092-items.md#decision--categories-one-tree-one-per-item) ·
  [test](../../server/test/items-list.e2e-spec.ts) "narrows to a type, to a category with those under it, or to the Uncategorised"
- **Each type's count, and All's, follows the search, the category and
  Discontinued as chosen; a type the organization holds an item of keeps
  its place, with its count, while a search finds none there.**
  [ADR-092](../adr/0092-items.md#decision--fifty-at-a-time-the-counts-from-the-server) ·
  [test](../../server/test/items-list.e2e-spec.ts) "counts each tab with the search and the category, a tab kept while a search finds none there"
- **It sorts by name unless asked, or by category, stock, date added or
  last changed, either way.** By category, by its path from the top,
  the Uncategorised last either way; by stock, fewest first, an item
  whose variants are counted in different units last either way; each
  then by name. While a search is typed, the closest match comes first,
  whichever way the sort runs.
  [ADR-092](../adr/0092-items.md#decision--sorting-and-the-rule-for-every-list) ·
  [test](../../server/test/items-list.e2e-spec.ts) "sorts by category by its path, the Uncategorised last either way" ·
  [test](../../server/test/items-list.e2e-spec.ts) "sums the stock on hand of every variant and place in its unit, or counts its variants where units differ" ·
  [test](../../server/test/items-list.e2e-spec.ts) "sorts by date added and last changed, either way" ·
  [test](../../server/test/items-list.e2e-spec.ts) "ranks a search before the sort, the closest first either way, and pages on the rank"
- **A row gives the item's first code and how many variants it has, its
  category's path from the top, and its stock on hand in every location,
  summed in its unit, or its number of variants where their units
  differ.** The stock is read from Inventory's figures for the page's
  items, never kept on the item.
  [ADR-092](../adr/0092-items.md#decision--a-row-the-name-first-its-stock-read-from-inventory) ·
  [test](../../server/test/items-list.e2e-spec.ts) "sums the stock on hand of every variant and place in its unit, or counts its variants where units differ" ·
  [test](../../server/test/items-list.e2e-spec.ts) "narrows to a type, to a category with those under it, or to the Uncategorised"
- **A row says Low or Out from the item's reorder points: out where any
  of its variants is out, else low where any is low; a discontinued item
  never.**
  [ADR-092](../adr/0092-items.md#decision--a-row-the-name-first-its-stock-read-from-inventory) ·
  [test](../../server/test/items-list.e2e-spec.ts) "says low or out from its reorder points, out before low"
- **Another organization's items, categories and stock are never listed
  nor counted.**
  [ADR-003](../adr/0003-multi-tenancy.md#decision) ·
  [test](../../server/test/items-list.e2e-spec.ts) "never shows another organization’s items, nor counts them"

## Categories

- **An organization keeps its items' categories as one tree: a category
  at the top or under another, at any depth, named in up to 100
  characters. Two categories beside each other, under one parent or both
  at the top, never share a name;** the same name under another parent is
  another category. Spaces around a name are dropped.
  [ADR-092](../adr/0092-items.md#decision--categories-one-tree-one-per-item) ·
  [test](../../server/test/product-categories.e2e-spec.ts) "adds a category at the top and one under it, and answers it as the tree shows it" ·
  [test](../../server/test/product-categories.e2e-spec.ts) "refuses a name already used under the same parent, at the top too, and allows it under another" ·
  [test](../../server/test/product-categories.e2e-spec.ts) "refuses a blank name or one past 100 characters"
- **Categories are listed by name: a Chinese name by its pinyin, the
  others by their letters, accents and case aside, and a number inside a
  name by its value,** so Size 2 comes before Size 10.
  [ADR-092](../adr/0092-items.md#decision--categories-one-tree-one-per-item) ·
  [test](../../server/test/product-categories.e2e-spec.ts) "lists the categories by name: a number by its value, a Chinese name by its pinyin"
- **Each category counts the items it holds itself, by type, the
  discontinued apart;** an item in a category under it is that
  category's.
  [ADR-092](../adr/0092-items.md#decision--categories-one-tree-one-per-item) ·
  [test](../../server/test/product-categories.e2e-spec.ts) "counts the items each category holds itself, by type, the discontinued apart"
- **A category can be renamed and moved at any time, to the top or under
  another. A move under itself, or under any category inside it, is
  refused, saying to choose another place;** so is a move to where its
  name is already taken.
  [ADR-092](../adr/0092-items.md#decision--categories-one-tree-one-per-item) ·
  [test](../../server/test/product-categories.e2e-spec.ts) "renames a category, and moves it under another and back to the top" ·
  [test](../../server/test/product-categories.e2e-spec.ts) "refuses a move under itself or under any category inside it" ·
  [test](../../server/test/product-categories.e2e-spec.ts) "refuses a name already used under the same parent, at the top too, and allows it under another"
- **A category is deleted only once nothing is in it. One holding items,
  discontinued ones too, or other categories is refused, saying how many
  of each and to move them out first.**
  [ADR-092](../adr/0092-items.md#decision--categories-one-tree-one-per-item) ·
  [test](../../server/test/product-categories.e2e-spec.ts) "deletes an empty category" ·
  [test](../../server/test/product-categories.e2e-spec.ts) "refuses to delete a category holding items or categories, saying how many and what to do"
- **An item is in one category or none, Uncategorised: given one when it
  is added, or none, and moved or taken out at any time.** A category
  another organization keeps is refused, as one that is not there.
  [ADR-092](../adr/0092-items.md#decision--categories-one-tree-one-per-item) ·
  [test](../../server/test/product-categories.e2e-spec.ts) "puts an item in a category when it is added, moves it, and takes it out" ·
  [test](../../server/test/product-categories.e2e-spec.ts) "refuses another organization’s category with a 400, as a parent or on an item"

## Names in other languages, and the name each reader sees

- **A product's own name is its base name, in whatever language the
  organization works in, and the fallback for every language.** Edit names
  gives the product, and each variant with a name of its own, a name in
  English, French or Simplified Chinese, and the product a description in
  each. A variant with no name has none to give in another language.
  [ADR-054](../adr/0054-languages.md#decision--a-products-name-and-description-may-be-kept-in-other-languages-which-are-required-is-the-organizations-setting) ·
  [test](../../server/test/languages.e2e-spec.ts) "keeps a product and its variants named in other languages, replaced as a set" ·
  [Help](../../client/src/help/guides/en/products.md#variants-images-and-names-variants) ·
  MC-1407
- **One name per language, never a blank one, and a description in a
  language needs a name in it.** The dialog says so before saving, naming
  the language; the server refuses a language twice, one it does not
  support, or a blank name.
  [ADR-054](../adr/0054-languages.md#decision--a-products-name-and-description-may-be-kept-in-other-languages-which-are-required-is-the-organizations-setting) ·
  [test](../../server/test/languages.e2e-spec.ts) "keeps one name per product and language, never a blank one" ·
  [test](../../server/test/languages.e2e-spec.ts) "keeps a product and its variants named in other languages, replaced as a set" ·
  partly tested ·
  MC-1407
- **Saving the names replaces them all: a language left blank is
  removed.** A variant's names are changed only through its own product.
  [ADR-054](../adr/0054-languages.md#decision--a-products-name-and-description-may-be-kept-in-other-languages-which-are-required-is-the-organizations-setting) ·
  [test](../../server/test/languages.e2e-spec.ts) "keeps a product and its variants named in other languages, replaced as a set" ·
  [test](../../server/test/languages.e2e-spec.ts) "refuses a variant through another product" ·
  MC-1407
- **Every screen names an item in the reader's language: the product's
  and the variant's name in the screen's language where it has one, else
  the base name.** The server works it out from the language the screen
  asks in, on every read that names an item: Products and the product's
  page, the item pickers, Inventory and its Movements, a lot's trace, an
  order's lines, shipments and returns, a price list's items, Plan a
  run's Uses, Recently opened, Home and the top bar's lookup. The screen
  never chooses among the names. A
  screen already open reads again when the language changes, keeping what
  it shows until the answer comes. A read added later that names an item
  fails a test until it does the same, or is listed as keeping the base
  name.
  [ADR-056, amended](../adr/0056-search.md#decision--an-items-name-in-the-readers-language-on-every-screen) ·
  [ADR-054](../adr/0054-languages.md#decision--a-products-name-and-description-may-be-kept-in-other-languages-which-are-required-is-the-organizations-setting) ·
  [test](../../client/src/lib/use-resource.test.ts) "reads again in the new language, keeping what is shown until it answers" ·
  [test](../../client/src/lib/use-keyset-list.test.ts) "reads the first page again when the language changes, keeping the rows up meanwhile (#297)" ·
  [test](../../client/src/lib/use-variants.test.ts) "reads the catalogue again when the language changes (#297)" ·
  [test](../../server/test/item-names.e2e-spec.ts) "Names in the reader’s language (e2e)" ·
  [test](../../server/test/item-names.e2e-spec.ts) "lists every operation that names an item, each reading the language or keeping the base" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "names what it finds in the reader’s language" ·
  MC-3801 · MC-3803 · MC-3804
- **A product's page is headed with the name the reader sees, and names
  its variants and images so too; it says its base name first among its
  names in other languages; Edit names and Edit start from the base
  name, and saving keeps it.**
  [ADR-056, amended](../adr/0056-search.md#decision--an-items-name-in-the-readers-language-on-every-screen) ·
  [test](../../server/test/item-names.e2e-spec.ts) "keeps the base name where the product page edits it, for a reader in Chinese (4.2)" ·
  [test](../../client/src/products/product-detail-page.test.tsx) "names the base name beside the others, under a translated heading" ·
  partly tested ·
  MC-3802
- **A product's description on its page is the base one, whatever the
  reader's language.** A description in another language is kept, and
  shown only in Edit names.
  [ADR-054](../adr/0054-languages.md#decision--a-products-name-and-description-may-be-kept-in-other-languages-which-are-required-is-the-organizations-setting) ·
  no test
- **Documents print in their own languages; CSV exports, History and the
  server's refusals keep the base name.**
  [ADR-056, amended](../adr/0056-search.md#decision--an-items-name-in-the-readers-language-on-every-screen) ·
  [test](../../server/test/item-names.e2e-spec.ts) "keeps the base name on the packing slip and in CSV, for a reader in Chinese" ·
  partly tested ·
  MC-3803
- **Items are listed by the name each reader sees: a Chinese name by its
  pinyin, the others by their letters, accents and case aside, and a
  number inside a name by its value, 30 before 120.**
  [ADR-056, amended](../adr/0056-search.md#decision--an-items-name-in-the-readers-language-on-every-screen) ·
  [ADR-092](../adr/0092-items.md#decision--sorting-and-the-rule-for-every-list) ·
  [test](../../server/test/items-list.e2e-spec.ts) "sorts by the name the reader sees, a number by its value and Chinese by its pinyin, either way" ·
  MC-3801
- **Where the organization requires product names in a language, an
  invoice that prints in it is refused until every product on it has a
  name in that language.** The organization chooses which, on its page.
  [ADR-054](../adr/0054-languages.md#decision--a-products-name-and-description-may-be-kept-in-other-languages-which-are-required-is-the-organizations-setting) ·
  [test](../../server/test/languages.e2e-spec.ts) "requires the languages the organization names, as a set of supported tags" ·
  [test](../../server/test/languages.e2e-spec.ts) "refuses to issue in a required language until every product is named in it" ·
  MC-1408

## Finding a product, and picking an item

- **Products' Search asks the server a moment after typing stops, from
  the first character, and lists what it finds, the closest first: a
  product by any of its variants' SKUs, by its own or a variant's name in
  any language, and a Chinese name by its pinyin too.** Discontinued
  products are found as well, as Products asks for them. The search stays in the address, so a
  reload, Back, or Show all from the top bar opens the list as it was. An
  empty answer says nothing matches the search; an empty catalogue, that
  there are no products yet.
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a product by part of a SKU or a name, case and accents ignored" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a product by its name in another language, shown in the reader’s" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a Chinese name by its pinyin, its initials or one character" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "ranks exact, then at the start, then anywhere, before the name’s order" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "answers every product without a search" ·
  [test](../../client/src/products/products-page.test.tsx) "asks with the address’s search, and lists the answer in its order" ·
  [test](../../client/src/products/products-page.test.tsx) "asks again once typing stops, and drops an answer that comes after a newer one" ·
  [test](../../client/src/products/products-page.test.tsx) "follows the address while open, and writes what is typed there without adding to the history" ·
  [test](../../client/src/products/products-page.test.tsx) "says no products yet for an empty catalogue, and nothing matches for an empty search" ·
  [Help](../../client/src/help/guides/en/products.md#products) ·
  MC-3901
- **An item picker lists the items its form offers, by SKU, until
  something is typed. From the first character it asks the server, a
  moment after typing stops, and lists what it finds in the server's
  order, a SKU typed whole first.** Typed or not, it offers only what its
  form does: an item already on the order is not offered again. Each item
  reads as its SKU, then the product and the variant, named in the
  reader's language.
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  [test](../../server/test/products.e2e-spec.ts) "lists every variant across products, ordered by SKU" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds an item by SKU, name, another language, pinyin or one character" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "puts a SKU typed whole first, and a translation’s exact name" ·
  [test](../../client/src/components/variant-picker.test.tsx) "lists what it is given before anything is typed, and asks nothing" ·
  [test](../../client/src/components/variant-picker.test.tsx) "asks once typing stops, and lists the answer in its order, within what it was given" ·
  [test](../../client/src/components/variant-picker.test.tsx) "drops an answer that comes after a newer one" ·
  MC-3804 · MC-3903
- **A picker says it is loading while the catalogue or a search is on its
  way, which a screen reader hears. "No matching items" comes only from an
  answer, and Receive says there are no products only once the catalogue
  has answered empty.**
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  [test](../../client/src/components/variant-picker.test.tsx) "says it is loading while it asks, and that nothing matches only from an answer" ·
  [test](../../client/src/components/variant-picker.test.tsx) "says it is loading while the catalogue has not come" ·
  [test](../../client/src/inventory/receive-stock-dialog.test.tsx) "says so when the catalogue is empty, and only once it has answered" ·
  MC-3903
- **A picker's catalogue is read again each time its dialog opens,** so
  an item added a moment ago, in another tab, is offered.
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  no test

## Images

- **A product has a gallery of up to eight images, in order; the first
  is its cover.** At eight, Add images is unavailable, saying why, and a
  ninth is refused. Images belong to the product, not to a variant.
  [ADR-062](../adr/0062-product-images.md#decision--a-product-has-a-gallery-up-to-eight-images-in-order-the-first-its-cover) ·
  [test](../../server/test/product-images.e2e-spec.ts) "adds images in order, the first the cover in the list" ·
  [test](../../server/test/product-images.e2e-spec.ts) "holds at most eight" ·
  [test](../../client/e2e/product-images.spec.ts) "adds an image that becomes the cover in the list" ·
  [Help](../../client/src/help/guides/en/products.md#variants-images-and-names-variants) ·
  [Help](../../client/src/help/guides/en/products.md#if-something-is-refused-refused) ·
  MC-1801
- **The cover shows beside the product's name on Products and in
  Inventory, and beside an item in the top bar's lookup. A product with no
  image shows a plain tile, the same for every type.**
  [ADR-062](../adr/0062-product-images.md#decision--where-they-show) ·
  [ADR-066](../adr/0066-covers-in-the-lookup.md#decision--an-items-result-shows-its-products-cover) ·
  [test](../../server/test/product-images.e2e-spec.ts) "adds images in order, the first the cover in the list" ·
  [test](../../server/test/lookup.e2e-spec.ts) "shows an item's cover, and none for other kinds" ·
  [test](../../client/e2e/product-images.spec.ts) "adds an image that becomes the cover in the list" ·
  partly tested ·
  MC-1801 · MC-2201
- **A photo is a PNG, JPEG or WebP image of up to 20 MB, judged by its
  content, not its name.** Several added at once each say why when
  refused, without stopping the others. A picture pasted on the product's
  page is added the same way.
  [ADR-059](../adr/0059-files.md#decision--uploads-go-through-the-app-and-are-checked-before-they-are-kept) ·
  [test](../../server/test/files.e2e-spec.ts) "goes by the bytes, and refuses what will not decode" ·
  partly tested ·
  MC-1801
- **The same photo twice on one product is refused,** by its content.
  [ADR-062](../adr/0062-product-images.md#decision--adding-removing-reordering) ·
  [test](../../server/test/product-images.e2e-spec.ts) "refuses the same photo twice on one product" ·
  MC-1801
- **A new order lists every image once, the cover first; removing one
  closes the gap, so the first is still the cover.** Each image's menu
  offers Make cover, Move left and Move right, as well as dragging.
  [ADR-062](../adr/0062-product-images.md#decision--adding-removing-reordering) ·
  [test](../../server/test/product-images.e2e-spec.ts) "reorders, and removes closing the gap" ·
  MC-1801
- **Removing an image can be undone for a few seconds, and for as long as
  Undo has focus or the pointer; then its file is released, and purged 30
  days later.** Nothing is sent until then, or until the page is left or
  another image is removed.
  [ADR-062](../adr/0062-product-images.md#decision--adding-removing-reordering) ·
  [ADR-059](../adr/0059-files.md#decision--released-then-purged-after-30-days) ·
  [test](../../client/e2e/product-images.spec.ts) "keeps Undo while it has focus, and brings the image back" ·
  [test](../../server/test/product-images.e2e-spec.ts) "reorders, and removes closing the gap" ·
  [test](../../server/test/files.e2e-spec.ts) "releases what was never used, and purges it 30 days on" ·
  MC-1801
- **Each image is described for a screen reader by the product's name, in
  the reader's language, and its place:** "Focus, image 2 of 4", and "the
  cover" for the first.
  [ADR-062](../adr/0062-product-images.md#decision--adding-removing-reordering) ·
  [test](../../client/e2e/product-images.spec.ts) "adds an image that becomes the cover in the list" ·
  MC-3802

## Exporting the catalogue

- **Export writes the items the list shows as a CSV file, a row per
  variant, by the list's own type, category, Discontinued, search and
  sort, each item with every variant by its code:** its SKU, product,
  variant, its type in the reader's words, its category's path from the
  top, unit, whether it tracks lots, whether it or its product is
  discontinued, then the product's and the variant's names in English,
  French and Chinese where it has them. Names are the base ones, the
  headers in the reader's language. Past 50,000 rows it is refused,
  saying to choose a type or a category, or search. History records each
  export with its type, category and Discontinued, in words, never what
  was typed.
  [ADR-057](../adr/0057-lists-by-date-range-sorted-where-it-helps-exported-as-csv.md#decision--csv-export-of-what-the-list-shows) ·
  [ADR-092](../adr/0092-items.md#decision--fifty-at-a-time-the-counts-from-the-server) ·
  [test](../../server/test/exports.e2e-spec.ts) "writes the catalogue, a row per variant" ·
  [test](../../server/test/exports.e2e-spec.ts) "writes the items the list shows, by its own query and in its order" ·
  [test](../../server/test/exports.e2e-spec.ts) "writes the type and the category in the reader’s words, and every language’s names" ·
  [test](../../server/test/exports.e2e-spec.ts) "refuses past 50,000 rows, naming what narrows the list" ·
  [test](../../client/src/products/products-page.test.tsx) "exports what the list shows, its search and Discontinued" ·
  MC-1558

## Who may do what, and what History keeps

- **Seeing the catalogue, adding a product and changing one each take
  their own permission: See the product catalogue, Add a product, and Edit
  or discontinue a product, which covers variants, names in other
  languages, images and categories too.** The Owner and an Admin hold all
  three; a Viewer, and every role template, sees only; and anyone holds
  those their roles grant. Seeing a product's images, or the categories,
  takes seeing the catalogue. No permission deletes a product. Another
  organization's products and categories are never found, and a variant
  is reached only through its own product.
  [ADR-062](../adr/0062-product-images.md#decision--adding-removing-reordering) ·
  [ADR-080](../adr/0080-job-roles.md#decision--roles-an-organization-makes-from-a-template-or-a-copy) ·
  [ADR-003](../adr/0003-multi-tenancy.md#decision) ·
  [test](../../server/test/products.e2e-spec.ts) "refuses a Viewer, which lacks products.create" ·
  [test](../../server/test/products.e2e-spec.ts) "refuses a Viewer, which lacks products.update" ·
  [test](../../server/test/products.e2e-spec.ts) "is readable by a Viewer, which holds products.view" ·
  [test](../../server/test/product-images.e2e-spec.ts) "lets a viewer see the gallery but not change it" ·
  [test](../../server/test/product-images.e2e-spec.ts) "refuses an image to whoever may not see the catalogue, in their words" ·
  [test](../../server/test/products.e2e-spec.ts) "does not show another organization catalogue" ·
  [test](../../server/test/products.e2e-spec.ts) "refuses a product in another organization" ·
  [test](../../server/test/products.e2e-spec.ts) "refuses a variant belonging to another product" ·
  [test](../../server/test/product-images.e2e-spec.ts) "keeps each organization to its own products and files" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "never finds another organization's products, items or partners" ·
  [test](../../client/e2e/products.spec.ts) "does not show another organisation's products" ·
  [test](../../server/test/product-categories.e2e-spec.ts) "lets a Viewer read the tree but not change it" ·
  [test](../../server/test/product-categories.e2e-spec.ts) "never shows another organization’s categories, nor counts its items" ·
  [test](../../server/test/product-categories.e2e-spec.ts) "answers 404 for another organization’s category, to rename or delete" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/products.md#variants-images-and-names-variants)
- **History keeps who added or changed a product, and when, under the
  product's base name at the time: a variant added with its SKU, a SKU
  changed with the old and the new, names in other languages as the new
  set, an image added by its file, a new order of images, and its
  category, when added and from and to, by the category's name, and its
  type and Discontinue from and to. A new name records who and when, not
  what changed.** A description is never recorded.
  [ADR-018](../adr/0018-audit-log.md#decision--never-record-the-request-body) ·
  [ADR-038](../adr/0038-an-audit-row-names-its-resource-as-it-was-at-the-time.md#decision--snapshot-a-label-at-write-time-in-audit_logresource_label) ·
  [test](../../server/test/audit.e2e-spec.ts) "records no payload for a route that names no fields" ·
  [test](../../server/test/audit.e2e-spec.ts) "names the resource as it was at the time" ·
  [test](../../server/test/audit.e2e-spec.ts) "records only the fields a route named" ·
  [test](../../server/test/audit.e2e-spec.ts) "filters by action" ·
  [test](../../server/test/languages.e2e-spec.ts) "keeps a product and its variants named in other languages, replaced as a set" ·
  [test](../../server/test/product-categories.e2e-spec.ts) "records an item’s category from and to, by name, and a rename beside an unchanged one" ·
  [test](../../server/test/products.e2e-spec.ts) "changes its type, which History records from and to, as Discontinue" ·
  partly tested
- **History keeps each category added, renamed, moved and deleted, by its
  name, and the category it sits under by that one's name,** the name it
  had kept once it is deleted. Saved with nothing changed, it records
  nothing.
  [ADR-092](../adr/0092-items.md#decision--categories-one-tree-one-per-item) ·
  [test](../../server/test/product-categories.e2e-spec.ts) "records each change to a category by its name, and its parent by name"
