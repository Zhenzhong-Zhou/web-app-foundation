# Search

What the app allows, refuses and works out when a person searches: the
top bar's Search everything, the Search box on a list, and the pickers
that find an item or a partner in a form, as the code does it today. All
of them match one way, on the server, so a record the top bar finds, its
list finds too. Each rule links the ADR that decided it, the test that
proves it, the Help section where a person meets it, and the manual check
that walks it by hand. Why a rule is so is in its ADR, above all
[ADR-056](../adr/0056-search.md) and its amendments; the Products and
Partners rules files each state their own list's search in one rule and
leave how it matches to this file. How this file is kept is in the
[README](README.md).

## How every search matches

- **A search finds what is typed anywhere in the text, capitals aside.**
  "2609" finds BF-2609 and FOC-2609-01; "po-100" finds PO-1001.
  [ADR-056](../adr/0056-search.md#decision--matching) ·
  [test](../../server/test/lookup.e2e-spec.ts) "groups what it finds by kind, the exact match first" ·
  [test](../../server/test/list-search.e2e-spec.ts) "finds orders by part of their reference or their partner, in any script" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a product by part of a SKU or a name, case and accents ignored" ·
  MC-1556 · MC-1557
- **A name matches with its accents, capitals and punctuation set aside; a
  code only with its capitals set aside.** "saint laurent" finds Pharmacie
  Saint-Laurent and "eleuthero" finds Éleuthéro. A code, that is an order's
  or a document's number, a reference, a SKU, a lot code, or a partner's
  code or tax ID, is matched as typed apart from capitals, so "FOC2609"
  does not find FOC-2609-01.
  [ADR-056](../adr/0056-search.md#decision--matching) ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "ignores accents and punctuation in a name" ·
  [test](../../server/test/stock.e2e-spec.ts) "finds names without accents, Chinese by pinyin, and % as itself" ·
  [test](../../server/test/list-search.e2e-spec.ts) "finds orders by part of their reference or their partner, in any script" ·
  partly tested ·
  MC-3902
- **A product's and a variant's name are found in every language they
  have, whatever language the reader uses.** A reader in Chinese who types
  the French name finds the product, as a reader in English does.
  [ADR-056](../adr/0056-search.md#decision--matching) ·
  [ADR-054](../adr/0054-languages.md#decision--a-products-name-and-description-may-be-kept-in-other-languages-which-are-required-is-the-organizations-setting) ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a product by its name in another language, shown in the reader’s" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds an item by SKU, name, another language, pinyin or one character" ·
  [Help](../../client/src/help/guides/en/products.md#products) ·
  MC-3901
- **A Chinese name is found by its characters, one being enough, and by
  its pinyin, typed without tones or spaces, in full or by its initials.**
  "鱼", "yuyou", "shenhaiyuyou" and "shyy" all find 深海鱼油. The server
  writes a name's pinyin whenever the name is saved: a product's, a
  variant's, a translation's or a partner's. A character with two readings
  takes the reading of the word it is in, and a wrong one is a search that
  misses, not an error. A name with no Chinese has no pinyin.
  [ADR-056](../adr/0056-search.md#decision--pinyin-written-when-a-name-is-saved) ·
  [test](../../server/src/common/pinyin.spec.ts) "writes the full pinyin and the initials, without tones or spaces" ·
  [test](../../server/src/common/pinyin.spec.ts) "reads a character by the word it is in" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a Chinese name by characters, pinyin, initials or one character" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a Chinese name by its pinyin, its initials or one character" ·
  [test](../../server/test/list-search.e2e-spec.ts) "finds orders by part of their reference or their partner, in any script" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/partners.md#partners) ·
  MC-3901 · MC-3902
- **Spaces around a search are dropped and a run of spaces inside reads
  as one; % and _ match themselves,** never anything else.
  [ADR-056](../adr/0056-search.md#decision--matching) ·
  [test](../../server/src/common/search.spec.ts) "trims, reads inner spaces as one, and builds the patterns" ·
  [test](../../server/src/common/search.spec.ts) "escapes LIKE wildcards, so % and _ match themselves" ·
  [test](../../server/test/stock.e2e-spec.ts) "searches the SKU, the product name and the lot code" ·
  [test](../../server/test/stock.e2e-spec.ts) "finds names without accents, Chinese by pinyin, and % as itself"
- **A search of punctuation alone finds no name,** only a code that holds
  it: "--" finds no partner by name.
  [ADR-056](../adr/0056-search.md#decision--matching) ·
  [test](../../server/src/common/search.spec.ts) "knows a query of punctuation alone has nothing to match a name with" ·
  partly tested

## What each kind of record is found by

- **An item: any part of its SKU, of its product's or its variant's name
  in any language, or of their pinyin.** Products finds a product through
  any of its variants, discontinued ones included; Inventory finds a row
  by its item or by its lot code. The top bar finds discontinued items too.
  [ADR-056](../adr/0056-search.md#decision--what-is-searched-by-what) ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a product by part of a SKU or a name, case and accents ignored" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a discontinued product, as the list shows it" ·
  [test](../../server/test/lookup.e2e-spec.ts) "finds an item by SKU or name, and a Chinese partner by pinyin" ·
  [test](../../server/test/stock.e2e-spec.ts) "searches the SKU, the product name and the lot code" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/products.md#products) ·
  MC-3901 · MC-308
- **A partner: any part of its name or its pinyin, its code or its tax
  ID.** Retired partners are found too.
  [ADR-056](../adr/0056-search.md#decision--what-is-searched-by-what) ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a partner by part of its name, its code or its tax ID" ·
  [test](../../server/test/lookup.e2e-spec.ts) "finds an item by SKU or name, and a Chinese partner by pinyin" ·
  [Help](../../client/src/help/guides/en/partners.md#partners) ·
  MC-3902 · MC-1547
- **An order: its number, the partner's reference, or its partner's
  name,** the name matched as a partner's is.
  [ADR-056](../adr/0056-search.md#decision--what-is-searched-by-what) ·
  [ADR-071, amended](../adr/0071-documents-as-pdf-drawn-on-the-server.md#amendment-october-2026--orders-get-numbers-of-their-own) ·
  [test](../../server/test/orders.e2e-spec.ts) "numbers each order as it is created, a series per direction (ADR-071)" ·
  [test](../../server/test/list-search.e2e-spec.ts) "finds orders by part of their reference or their partner, in any script" ·
  [test](../../server/test/lookup.e2e-spec.ts) "finds its own records through each join, none of a twin organization's" ·
  MC-1557 · MC-2503
- **An invoice, a credit note or a return: its number in the top bar; on
  its own list, its number or its partner's name.** A draft invoice has no
  number until it is issued, so the top bar does not find it, and Invoices
  finds it by its partner.
  [ADR-056](../adr/0056-search.md#decision--what-is-searched-by-what) ·
  [test](../../server/test/numbering.e2e-spec.ts) "puts the kind a query’s prefix names first in the lookup" ·
  [test](../../server/test/credit-notes.e2e-spec.ts) "lists credit notes, by number, partner and credit date (ADR-057)" ·
  partly tested ·
  MC-1557
- **A production run: its reference,** in the top bar and on Production;
  not by what it makes.
  [ADR-056](../adr/0056-search.md#decision--what-is-searched-by-what) ·
  no test ·
  MC-1557
- **A lot: any part of its code,** in the top bar and on Inventory.
  [ADR-056](../adr/0056-search.md#decision--what-is-searched-by-what) ·
  [test](../../server/test/lookup.e2e-spec.ts) "groups what it finds by kind, the exact match first" ·
  [test](../../server/test/stock.e2e-spec.ts) "searches the SKU, the product name and the lot code" ·
  [Help](../../client/src/help/guides/en/lots.md#trace-a-lot-trace) ·
  MC-1556 · MC-308
- **Locations, people and settings are not in the top bar's search.**
  Each is found from its own page, and People has a box of its own.
  [ADR-056](../adr/0056-search.md#decision--what-is-searched-by-what) ·
  no test

## Searching everything from the top bar

- **Search everything, in the top bar of every page, finds records of
  every kind and opens one.** It does not search the page's text, which the
  browser's Find does. The kinds come in a fixed order, Orders, Invoices,
  Credit notes, Lots, Items, Partners, Production runs and Returns, at
  most five of each, under each kind's name.
  [ADR-056](../adr/0056-search.md#decision--order-of-results) ·
  [test](../../server/test/lookup.e2e-spec.ts) "groups what it finds by kind, the exact match first" ·
  [test](../../client/src/search/lookup-box.test.tsx) "asks after two characters, and shows results by kind" ·
  MC-1556
- **It asks for at least two characters, or one Chinese character,**
  spaces around them aside. One letter, digit or punctuation mark alone,
  Chinese punctuation included, says "Type at least two characters, or
  one Chinese character." and asks nothing; the server refuses the same,
  and a search over 100 characters.
  [ADR-056, amended](../adr/0056-search.md#decision--the-lookups-ranking-and-one-minimum-everywhere) ·
  [test](../../server/test/lookup.e2e-spec.ts) "asks for at least two characters, or one Chinese character, after trimming" ·
  [test](../../server/test/lookup.e2e-spec.ts) "finds an item by one Chinese character of its name" ·
  [test](../../server/src/common/search.spec.ts) "takes one Chinese character alone, and no other one character" ·
  [test](../../client/src/search/lookup-minimum.test.ts) "takes one Chinese character alone, and no other one character" ·
  [test](../../client/src/search/lookup-box.test.tsx) "asks for one Chinese character alone" ·
  MC-1556
- **It asks a moment after typing stops, and never shows the answer to an
  older search:** one that comes after a newer search is dropped.
  [ADR-056](../adr/0056-search.md#decision--in-the-browser) ·
  [test](../../client/src/search/lookup-box.test.tsx) "asks after two characters, and shows results by kind" ·
  partly tested
- **In each kind, an exact match comes first, then one that starts with
  the search, then one anywhere; the newest first among equals.** An item
  ranks by its SKU, its product's name as the reader sees it and as
  stored, and their pinyin, so 专注胶囊 or zhuanzhujiaonang puts the product
  of that name before 安神专注胶囊.
  [ADR-056](../adr/0056-search.md#decision--order-of-results) ·
  [test](../../server/test/lookup.e2e-spec.ts) "groups what it finds by kind, the exact match first" ·
  [test](../../server/test/lookup.e2e-spec.ts) "ranks an exact match on the reader's name for an item first" ·
  partly tested
- **A search that starts with one of the organization's number prefixes
  puts that kind first,** the longest prefix that fits: with invoices
  numbered QX-, QX-000001 lists Invoices before Orders, and SO- or PO-
  lists Orders first. A search that is exactly a lot's code puts Lots
  first. With one kind found, there is nothing to reorder.
  [ADR-056, amended](../adr/0056-search.md#amendment-october-2026--the-organizations-prefixes-adr-073) ·
  [ADR-073](../adr/0073-each-organizations-document-numbering.md#decision--what-else-reads-the-prefixes) ·
  [test](../../server/test/numbering.e2e-spec.ts) "puts the kind a query’s prefix names first in the lookup" ·
  [test](../../server/test/lookup.e2e-spec.ts) "groups what it finds by kind, the exact match first" ·
  MC-2713 · MC-1556
- **A typo is forgiven only in the top bar, and only when the whole
  search found fewer than five records.** Each kind then adds close
  matches after its exact ones, best first, marked "close match": "fokus"
  finds Focus 60ct, "nortside" Northside Pharmacy. A close match is looked
  for in an order's number, reference and partner's name, an item's SKU
  and its product's own name, a partner's name, and the other kinds'
  number, reference or code; not in a translation, a variant's name, a
  pinyin, or a partner's code or tax ID. A list or a picker never adds
  close matches.
  [ADR-056](../adr/0056-search.md#decision--matching) ·
  [test](../../server/test/lookup.e2e-spec.ts) "forgives a typo with a close match, after any exact one" ·
  [test](../../client/src/search/lookup-box.test.tsx) "asks after two characters, and shows results by kind" ·
  partly tested ·
  MC-1556
- **Each result shows its record's number or name, and a second line:**
  an order, an invoice, a credit note or a return its partner; a lot its
  SKU and its expiry; an item its SKU and its product's cover, and its
  name in the reader's language; a run its item's SKU; a partner its code.
  [ADR-056](../adr/0056-search.md#decision--in-the-browser) ·
  [ADR-066](../adr/0066-covers-in-the-lookup.md#decision--an-items-result-shows-its-products-cover) ·
  [ADR-056, amended](../adr/0056-search.md#decision--an-items-name-in-the-readers-language-on-every-screen) ·
  [test](../../server/test/lookup.e2e-spec.ts) "shows an item's cover, and none for other kinds" ·
  [test](../../server/test/lookup.e2e-spec.ts) "finds its own records through each join, none of a twin organization's" ·
  [test](../../server/test/lookup.e2e-spec.ts) "ranks an exact match on the reader's name for an item first" ·
  MC-2201 · MC-1556
- **A result opens its record:** an item opens its product, a lot its
  trace.
  [ADR-056](../adr/0056-search.md#decision--what-is-searched-by-what) ·
  [test](../../client/e2e/search.spec.ts) "finds a lot from the top bar and opens its trace" ·
  [Help](../../client/src/help/guides/en/lots.md#trace-a-lot-trace) ·
  MC-1556
- **Each kind ends with Show all in its list, which opens that list with
  the same search:** Orders, Invoices, Credit notes, Inventory for lots,
  Products for items, Partners, Production and Returns.
  [ADR-056](../adr/0056-search.md#decision--order-of-results) ·
  [test](../../client/src/products/products-page.test.tsx) "follows the address while open, and writes what is typed there without adding to the history" ·
  [test](../../client/src/products/products-page.test.tsx) "asks with the address’s search, and lists the answer in its order" ·
  partly tested ·
  MC-1557 · MC-3901 · MC-3902
- **Show all keeps the list's own filters.** Orders and Returns open on
  Open, and Inventory without emptied stock, so a fulfilled or cancelled
  order, a closed return or a used-up lot the top bar found shows there
  only once All, or Show emptied, is pressed.
  [ADR-056](../adr/0056-search.md#decision--two-kinds-of-search-one-way-of-matching) ·
  no test
- **Nothing found says "Nothing found."** and offers no list to open.
  [ADR-056](../adr/0056-search.md#decision--in-the-browser) ·
  [test](../../client/src/search/lookup-box.test.tsx) "says when nothing is found" ·
  MC-1556
- **Before anything is typed, it offers the five records last opened,**
  so / then Enter reopens the last one.
  [ADR-058](../adr/0058-home.md#decision--recently-opened-for-picking-up-where-one-left-off) ·
  [test](../../client/e2e/recent.spec.ts) "a partner once opened is on Home and in the empty search"
- **/ opens it from anywhere but a field being typed in, and ⌘K or
  Ctrl+K from anywhere.** Arrow keys move, Enter opens, Escape closes. From
  900 pixels wide it sits in the top bar; narrower, a search button opens
  it over the whole screen.
  [ADR-056](../adr/0056-search.md#decision--in-the-browser) ·
  [test](../../client/e2e/search.spec.ts) "opens the lookup with / from anywhere on the page" ·
  [test](../../client/src/search/lookup-box.test.tsx) "opens on ⌘K, and ignores a key event with no key" ·
  [test](../../client/e2e/search.spec.ts) "finds a lot from the top bar and opens its trace" ·
  partly tested ·
  MC-1556

## Searching a list

- **Products, Partners, Orders, Invoices, Credit notes, Returns,
  Production and Inventory search on the server:** the whole list, not
  only the rows on screen, together with the list's other filters.
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  [ADR-056](../adr/0056-search.md#decision--one-lookup-endpoint-each-lists-own) ·
  [test](../../server/test/list-search.e2e-spec.ts) "finds orders by part of their reference or their partner, in any script" ·
  [test](../../server/test/date-range.e2e-spec.ts) "narrows orders to an expected-date range, both days included" ·
  [test](../../server/test/stock.e2e-spec.ts) "searches the SKU, the product name and the lot code" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a product by part of a SKU or a name, case and accents ignored" ·
  MC-1557 · MC-308 · MC-301
- **A list takes a search of any length, one character included, up to
  100 characters.** Only the top bar asks for two.
  [ADR-056, amended](../adr/0056-search.md#decision--the-lookups-ranking-and-one-minimum-everywhere) ·
  [test](../../server/test/stock.e2e-spec.ts) "finds names without accents, Chinese by pinyin, and % as itself" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds a Chinese name by its pinyin, its initials or one character" ·
  partly tested
- **Products and Partners put the closest match first:** exact, then at
  the start, then anywhere, then by name, a product by the name the reader
  sees. A product ranks by its closest variant.
  [ADR-056, amended](../adr/0056-search.md#decision--the-lookups-ranking-and-one-minimum-everywhere) ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "ranks exact, then at the start, then anywhere, before the name’s order" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "ranks exact, then at the start, then anywhere, then by name" ·
  MC-3902
- **The paged lists keep their own order when searched:** Orders,
  Invoices, Credit notes, Returns, Production and Inventory are narrowed by
  a search, not ranked by it, so Load more carries on where it was.
  [ADR-056, amended](../adr/0056-search.md#decision--the-lookups-ranking-and-one-minimum-everywhere) ·
  no test
- **Orders, Invoices, Credit notes, Returns, Production, Products and
  Partners keep their search in the page's address.** Show all from the
  top bar opens the list narrowed. What is typed is written there a moment
  after typing stops, in place of the page in the history, so Back leaves
  the list; Show all on the list already open, Back and Forward change the
  box and the list together; a reload, or Back from a record, keeps it.
  Inventory reads the address only when it opens.
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  [test](../../client/src/products/products-page.test.tsx) "follows the address while open, and writes what is typed there without adding to the history" ·
  [test](../../client/src/partners/partners-page.test.tsx) "asks with the address’s search, and lists the answer in its order" ·
  partly tested ·
  MC-3901 · MC-3902
- **A list asks a moment after typing stops, and drops an answer that
  comes after a newer one.**
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  [test](../../client/src/products/products-page.test.tsx) "asks again once typing stops, and drops an answer that comes after a newer one" ·
  [test](../../client/src/partners/partners-page.test.tsx) "asks again once typing stops, and drops an answer that comes after a newer one"
- **A search that finds nothing says "Nothing matches that search.",**
  not the empty list's first-time message.
  [ADR-056](../adr/0056-search.md#decision--matching) ·
  [test](../../client/src/products/products-page.test.tsx) "says no products yet for an empty catalogue, and nothing matches for an empty search" ·
  [test](../../client/src/partners/partners-page.test.tsx) "says nothing matches for an empty answer to a search" ·
  MC-1546
- **An export holds what the search found on Orders, Invoices, Credit
  notes and Inventory; Products' and Partners' exports hold everything,
  whatever is typed.**
  [ADR-057](../adr/0057-lists-by-date-range-sorted-where-it-helps-exported-as-csv.md#decision--csv-export-of-what-the-list-shows) ·
  no test ·
  MC-1558
- **People narrows what it has loaded, in the browser,** by part of a
  name, job title, department or email, capitals aside but not accents,
  and never by pinyin.
  [ADR-063](../adr/0063-people.md#decision--a-people-page-for-finding-someone-a-page-per-person-for-everything-else) ·
  no test ·
  [Help](../../client/src/help/guides/en/people.md#find-someone-find) ·
  MC-1901
- **Trace a lot finds a lot by any part of its code, across products,**
  each with its SKU, the codes that start with it first, at most 20. An
  empty box is refused.
  [ADR-044](../adr/0044-lot-trace.md#decision--search-by-any-part-of-a-code-across-products) ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "finds a lot by the start of its code" ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "finds a lot by any part of its code" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/lots.md#trace-a-lot-trace) ·
  MC-901

## Picking an item or a partner

- **Every item picker and every partner picker searches the server, as
  Products and Partners do.** The item pickers are in Receive, Add an
  item, New order, Set price, a recipe's component, Plan run and the
  Movements filter; the partner pickers are New order's Partner, a
  sample's Given to and Plan run's Contract manufacturer. A SKU typed whole
  comes first.
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "finds an item by SKU, name, another language, pinyin or one character" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "puts a SKU typed whole first, and a translation’s exact name" ·
  [test](../../client/src/orders/create-order-page.test.tsx) "finds a partner by its pinyin" ·
  [test](../../client/src/orders/create-order-page.test.tsx) "finds a partner by its name without accents" ·
  MC-3903 · MC-3904
- **Before anything is typed, a picker lists what its form offers and
  asks nothing; from the first character, it asks a moment after typing
  stops, lists the server's order, and drops an answer that comes after a
  newer one.**
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  [test](../../client/src/components/variant-picker.test.tsx) "lists what it is given before anything is typed, and asks nothing" ·
  [test](../../client/src/components/variant-picker.test.tsx) "asks once typing stops, and lists the answer in its order, within what it was given" ·
  [test](../../client/src/components/variant-picker.test.tsx) "drops an answer that comes after a newer one" ·
  [test](../../client/src/components/partner-picker.test.tsx) "lists what it is given before anything is typed, and asks nothing" ·
  MC-3903
- **A picker offers only what its form offers, typed or not:** a
  discontinued item, a retired partner, or an item already on the order,
  the price list or the recipe stays out.
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "leaves out a discontinued item, as it does without a search" ·
  [test](../../client/src/components/variant-picker.test.tsx) "asks once typing stops, and lists the answer in its order, within what it was given" ·
  [test](../../client/src/components/partner-picker.test.tsx) "asks once typing stops, and lists the answer in its order, within what it was given" ·
  MC-3903 · MC-3904
- **A picker says it is loading while it asks, or while its list has not
  come, and says No matching items, or No matching partners, only from an
  answer.** A search that fails says the list could not be loaded.
  [ADR-056, amended](../adr/0056-search.md#decision--products-partners-and-the-item-pickers-searched-on-the-server) ·
  [test](../../client/src/components/variant-picker.test.tsx) "says it is loading while it asks, and that nothing matches only from an answer" ·
  [test](../../client/src/components/variant-picker.test.tsx) "says it is loading while the catalogue has not come" ·
  [test](../../client/src/components/partner-picker.test.tsx) "says it is loading while it asks, and that nothing matches only from an answer" ·
  partly tested ·
  MC-3903 · MC-3904

## Who finds what, and what History keeps

- **The top bar searches only the kinds a person may see:** orders with
  See purchase and sales orders; invoices and credit notes with See
  invoices and credit notes; lots with See what is on hand and where;
  items with See the product catalogue; partners with See customers and
  suppliers; runs with See production runs and what they consumed; returns
  with See return authorizations. A kind not held is not searched, so
  nothing says a record exists that its list would hide. The Owner, an
  Admin and a Viewer hold them all, and anyone holds those their roles
  grant, as the Stock look-up template finds lots and items only. A list
  or a picker needs its list's own permission.
  [ADR-056](../adr/0056-search.md#decision--permissions-and-tenancy-decide-what-is-found) ·
  [ADR-080](../adr/0080-job-roles.md#decision--roles-an-organization-makes-from-a-template-or-a-copy) ·
  [test](../../server/test/lookup.e2e-spec.ts) "leaves out every kind the member may not view" ·
  partly tested
- **Another organization's records are never found,** by the top bar, a
  list or a picker, whatever their names and codes.
  [ADR-056](../adr/0056-search.md#decision--permissions-and-tenancy-decide-what-is-found) ·
  [ADR-003](../adr/0003-multi-tenancy.md#decision) ·
  [test](../../server/test/lookup.e2e-spec.ts) "never finds another organization's records" ·
  [test](../../server/test/lookup.e2e-spec.ts) "finds its own records through each join, none of a twin organization's" ·
  [test](../../server/test/list-search.e2e-spec.ts) "never finds another organization's orders" ·
  [test](../../server/test/whole-list-search.e2e-spec.ts) "never finds another organization's products, items or partners"
- **A search changes nothing, and History records none; an export
  records what was typed, among its filters.**
  [ADR-056](../adr/0056-search.md#decision--permissions-and-tenancy-decide-what-is-found) ·
  [ADR-057](../adr/0057-lists-by-date-range-sorted-where-it-helps-exported-as-csv.md#decision--csv-export-of-what-the-list-shows) ·
  [test](../../server/test/audit-words.e2e-spec.ts) "names every field of the entries written outside @Audited" ·
  partly tested ·
  MC-1558
