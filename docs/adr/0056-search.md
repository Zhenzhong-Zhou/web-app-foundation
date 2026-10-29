---
status: accepted
date: 2026-10-07
areas: [partners, products, search, database, i18n, ui]
amended-by: [ADR-073]
---

# ADR-056 — Search: one lookup in the top bar, and a search on every list

## Context

Nothing in the app finds a record by what a person has in hand.
A customer rings about invoice INV-000214, a supplier emails about lot
FOC-2609-01, the recall drill starts from a lot code: each means knowing
which list it is on, opening it and paging. Only the inventory searches
(SKU, product name, lot code, `ILIKE` on the server), the lot trace finds a
lot by part of its code, and since the UI pass Products and Partners narrow
what they have already loaded, in the browser. Orders, invoices, returns and
runs have no search at all. ADR-055 left a slot beside the logo for "a
lookup", and its *Open decisions* asked for one box that takes a lot code,
an order or invoice number or a SKU, and for search on the lists.

What people type is mostly short and partial: "2609", "INV-214", "focus",
"northside", "鱼油", "saint laurent" for "Pharmacie Saint-Laurent". Three
languages are read and typed, product names have translations (ADR-054),
and identifiers mix letters, digits and dashes.

## Decision — two kinds of search, one way of matching

- **The lookup**, a box in the top bar on every page, finds **records of any
  kind** and goes to one. It is not a search of the text on the page; the
  browser's own Find does that.
- **List search**, a box in each list's filter row (ADR-055), narrows **that
  list**, with its other filters, and pages as the list does.

Both match the same way, so a record the lookup finds, its list finds too.

## Decision — what is searched, by what

| Kind | Matched on | Opens |
| --- | --- | --- |
| Order | its reference; the partner's name | the order |
| Invoice, credit note | its number | the document |
| Return authorization | its number | the RMA |
| Production run | its reference | the run |
| Lot | its code | the lot's trace |
| Item | SKU; product and variant name, in every language it has | the product |
| Partner | name, code, tax ID | the partner |

Locations, members and settings are not in the lookup: few, and found from
their own pages.

## Decision — matching

- **Anywhere in the text, case ignored:** "2609" finds BF-2609 and
  FOC-2609-01, "inv-214" finds INV-000214. Surrounding spaces are trimmed and
  inner runs of spaces read as one. At least **2 characters**: one matches
  nearly everything.
- **Accents and punctuation ignored on names, not on codes:** "saint
  laurent" finds "Pharmacie Saint-Laurent", "eleuthero" finds "Éleuthéro".
  Through `search_text()` (migration 0043): Postgres's `unaccent` in an
  immutable wrapper so it can be indexed, lower case, and every run of
  punctuation and spaces read as one space. Codes are compared as typed,
  apart from case.
- **Every language at once.** An item is found by its name in any language
  it has, whatever language the reader uses, and shown in the reader's
  language (ADR-054). A Chinese reader typing an English name still finds it.
- **Chinese by characters.** Substring matching needs no word splitting, so
  "鱼油" finds "深海鱼油".
- **Chinese by pinyin as well.** A Chinese name is also found by its pinyin,
  typed without tones or spaces: "yuyou", "shenhaiyuyou", and its initials
  "shyy", all find "深海鱼油". The server writes each name's pinyin when the
  name is saved (below); a query of Latin letters matches it as it matches
  any name, anywhere in the text. Names with no Chinese have no pinyin.
- **Typos forgiven, after exact matches.** When the whole lookup finds
  fewer than five records, it adds close matches in each kind by trigram
  similarity (`word_similarity` above 0.3, on the accent-free form):
  "fokus" finds "Focus 60ct", "nortside" finds "Northside Pharmacy",
  "FOC-2690" finds "FOC-2609-01". They come after a kind's exact matches,
  marked "close match" in the reader's language, best first.
  *Amended while building:* first written as "when a kind finds fewer than
  five", which ran the close pass in nearly every kind of nearly every
  lookup; the perf budget caught a lot code's lookup at 329 ms against 300,
  and its close matches were all noise. A typo is a search that finds next
  to nothing. List search shows exact matches only, not close ones as first
  written: the lookup is where a typo is forgiven, and a list empty for a
  typo says so, with the lookup one key away.

## Decision — order of results

Within each kind: an exact match first, then
a match at the start, then anywhere; ties by most recent. The lookup shows at
most **5 of each kind**, kinds in a fixed order (orders, documents, lots,
items, partners, runs, returns), except that a query shaped like a known
number (`INV-`, `CN-`, `RMA-`, or exactly a lot code) puts that kind first.
Each kind's group ends with "Show all in Orders" (or its list), which opens
the list with the same search.

## Decision — pinyin, written when a name is saved

Postgres cannot turn
Chinese into pinyin, so the server does, with `pinyin-pro` (MIT, widely used,
no network): a new dependency. Each table with a searched name
(`products`, `product_variants`, the two translation tables, `partners`)
gains `name_pinyin`, text holding the full pinyin and the initials, lower
case, no tones or spaces: `shenhaiyuyou shyy`. Written on every insert and
update of the name, through one helper the services call, and null when the
name has no Chinese characters. Characters with two readings (多音字) take the
library's choice for the word; a wrong reading is a miss, not an error.
Existing rows are filled by a one-off script run with the migration, since
the conversion lives in Node, not in SQL.

## Decision — indexes: trigrams in Postgres, no search engine

The
extension `pg_trgm` and a GIN index with `gin_trgm_ops` on each searched
column (`orders.reference`, `invoices.number`, `credit_notes.number`,
`return_authorizations.number`, `production_orders.reference`, `lots.code`,
`product_variants.sku` and `name`, `products.name`, the two translation
tables' `name`, `partners.name`, `code` and `tax_id`, and each
`name_pinyin`), the name columns through the `unaccent` wrapper. The same
indexes serve the close matches: `word_similarity` with its `<%` operator
uses a trigram index. A trigram index serves `ILIKE '%…%'`, which
a B-tree cannot; it costs some write time and space, small at this volume.

Two limits, recorded: a query of fewer than 3 characters cannot use a
trigram index, so "鱼油" reads the organization's rows of that column, fast
at today's sizes and inside the budget below; and the index covers the
column across organizations, with the organization filter applied after.
Both are revisited by the triggers below, not now.

## Decision — one lookup endpoint; each list's own

`GET /v1/lookup?q=`
answers every kind in one response, grouped, each group its own query in one
transaction. List search is a `search` parameter on each list's endpoint
(orders, invoices, credit notes, returns, runs, stock already), combined
with the list's filters and keyset paging (ADR-051). Products and Partners
keep narrowing in the browser while they load whole; past a few hundred rows
they move to the server, the same parameter.

## Decision — permissions and tenancy decide what is found

A kind the member
may not view (`orders.view`, `invoices.view`, `return_authorizations.view`,
`production.view`, `stock.view`, `products.view`, `partners.view`) is not
queried and not shown; the lookup never says a record exists that its list
would not show. Every query goes through TenantDb (ADR-003, ADR-016), so
another organization's records cannot match. Queries are not written to the
audit log: a search changes nothing.

## Decision — in the browser

- **The box** sits in the top bar's empty slot from 1200px; below, a search
  button there opens it full width. `/` or ⌘K / Ctrl+K focuses it from
  anywhere except a field being typed in.
- **A combobox** (ARIA 1.2, as MUI's Autocomplete builds it): results under
  the box, grouped with their kind's name, each row the number or name, a
  short second line (partner, status chip, expiry chip) and the kind's icon.
  Arrow keys move, Enter opens, Escape closes. Typing waits 200 ms before
  asking; an answer that arrives after a newer query is dropped.
- **Nothing found** says so, with the list links still offered.
- In every language, the kinds' names and the empty sentence from the
  catalogues; the records' own text as stored.

## Decision — a budget before it ships

ADR-051's volume seed gains the
lookup and a list search, and `perf/` a budget for them, set from the first
measurement at the small scale. A plan check confirms the trigram indexes are
used for queries of 3 characters or more.

## Consequences

- Built in this order, each its own commit:
    1. Migration: `pg_trgm`, `unaccent`, the immutable wrapper, the
       `name_pinyin` columns, the indexes. Render's Postgres allows both
       extensions.
    2. Pinyin: `pinyin-pro`, the helper, every service that saves a name
       calling it, and the one-off script that fills existing rows, with
       unit tests (full pinyin, initials, mixed Chinese and Latin, no
       Chinese).
    3. The matching in one place on the server (normalising, the `%…%`
       pattern with `%` and `_` escaped, the accent-free form, the close
       matches), used by every search; the inventory and the lot trace move
       onto it.
    4. `search` on the lists that lack it (orders, invoices, credit notes,
       returns, runs), with e2e cases: partial, case, accents, another
       language, pinyin, a typo, another organization's record not found.
    5. `GET /v1/lookup`, grouped and ranked, close matches after exact ones,
       permissions per kind, with e2e cases for each rule above.
    6. The box in the top bar and the list boxes in the filter rows, with
       unit tests, an e2e flow (type "2609", Enter, the lot's trace), and the
       lookup added to `accessibility.spec`.
    7. The perf budget and the plan check; manual checks for Chinese input
       by characters and by pinyin, a typo, a phone, and the keyboard.
- The *Open decisions* entry "Search and the lookup in the top bar" is
  settled by this ADR.

## Considered and not done

- **Postgres full-text search** (`tsvector`). Built for words in prose, with
  stemming per language; it splits "FOC-2609-01" into pieces, does not match
  inside a word ("2609" in "BF2609"), and has no Chinese parser. Most of what
  is typed here is codes and names.
- **A search engine** (Meilisearch, Typesense, Elasticsearch). Better typo
  tolerance and language-aware tokenizing, at the price of another service to
  run, keep in sync with every write, secure and split by organization. Not
  at this size.
- **Searching in the browser everywhere.** Only works for what is loaded;
  Products and Partners do it until they are too large to load whole.
- **One endpoint per kind, called together from the browser.** Seven
  requests per keystroke, seven permission checks in the client, and the
  grouping and ranking in JavaScript.
- **Pinyin converted in the database.** No maintained Postgres extension
  does it on Render; a generated column would need one.
- **Recent and pinned records in the lookup.** Useful, and a separate
  question of what to remember per person; not in this ADR.

## Deferred — each with what brings it in

- **An index per organization** (`btree_gin`, the organization id with the
  trigram) or partial indexes. Trigger: one organization's rows dominating a
  table, or the budget missed.
- **A search engine.** Trigger: typo tolerance or ranking that trigrams
  cannot give (a misspelling with no letters in common), or volume past
  what the budget allows.
- **Pinyin with tone marks, or fuzzy pinyin** (zh typed as z, l as n, as
  some regional accents do). Trigger: a Chinese-reading user missing a
  record they typed the way they say it.

## Amendment (October 2026) — the organization's prefixes (ADR-073)

A
query shaped like a known number is one that starts with one of the
organization's own prefixes, the longest that fits, read when the lookup
runs; order numbers join invoices, credit notes and RMAs. `INV-`, `CN-` and
`RMA-` are only the defaults.

## Amendment (October 2026) — names in the reader's language, and Products, Partners and the item pickers searched on the server

The Products page shows each product by its base name, and its search box,
Partners' and the item pickers' match what they have loaded, in the
browser, by case alone. A reader in Chinese sees Focus 60ct where the top
bar's lookup says 专注胶囊 60 粒, and cannot find it on Products, or pick
it in Receive, by its Chinese name, its pinyin or a part of its SKU
(#260). ADR-054 already says a screen names an item in the reader's
language; only the lookup does. This amendment brings every screen and
every search box to what the lookup does (Bob, 28 October 2026, as
recommended).

Checked before drafting, as the working agreements ask:

- **Fired: none.** This ADR's Deferred: an index per organization, whose
  missed budget (#225) went once #186 put the organization on the
  lookup's joins, without one; a search engine; pinyin with tones or
  fuzzy pinyin. ADR-054's Deferred. ADR-062's images on order lines and
  the shipping screen, whose trigger is picking errors. Open decisions'
  "Product list pagination": both lists still load whole.
- **Taken here.** #250: Receive says "No products yet" while the
  catalogue loads, the same fault a picker asking the server would
  repeat. #263's note wording. #270, the esbuild override under
  drizzle-kit. #226's two joins not bounded by organization, the product
  export's and a price list's items', in services this changes.
- **Kept in step.** #261 (people in the lookup, runs found by their
  product, Help on search) waits for the first fix-up batch, with #154
  (settings in the lookup) and #150. The names parts of #167 and #256 are
  met here; the rest of each stays. #161's packing slip names are a
  document's (ADR-071), fixed with the documents.
- **Found while checking.** On the server, only the lookup names an item
  in the reader's language; Inventory, Movements, orders, price lists,
  recipes, runs, the lot trace and the pickers show the base name.
  Products, Partners, People and the pickers match in the browser; the
  other lists on the server, by this ADR's matching.

### Decision — an item's name in the reader's language, on every screen

- **Resolved on the server,** by one rule every read that names an item
  for a person uses: the product's and the variant's name in the
  request's language (Accept-Language, which the client sets to the
  screen's, as errors and notifications already use), else the base
  name. The client never chooses among translations.
- **Every such read,** listed by the build's first step before anything
  changes: Products and the product page, the item pickers, Inventory,
  Movements, an order's lines, shipments and returns, a price list's
  items, recipes, runs and the lot trace. The list becomes a test that
  asks each in Chinese and expects the Chinese name, so a screen added
  later that skips the rule fails.
- **Unchanged.** The audit log and the server's refusals keep the base
  name (ADR-054). Documents print in their own languages (ADR-054,
  ADR-071). CSV exports keep the base name; the product export already
  has every language. The SKU stays the identifier everyone shares.
- **Sorted by the name shown:** a Chinese name by its pinyin, the
  `name_pinyin` kept for search, as a Chinese reader expects; any other
  accent-free, as `search_text()` reads it.

### Decision — Products, Partners and the item pickers searched on the server

- **Products and Partners** take `search` on `GET /v1/products` and
  `GET /v1/partners`, matched as the lookup matches items and partners:
  a product by its SKUs, its and its variants' names in every language,
  and their pinyin; a partner by name, accent-free and by pinyin, code
  and tax ID. Without a search both still load whole; paging waits for
  Open decisions' trigger. This replaces "Products and Partners keep
  narrowing in the browser while they load whole" above.
- **Both pages** keep their search in the address through
  `useListSearch`, as Orders does, so Show all from the lookup lands on a
  list showing what it found.
- **The item pickers,** a third kind of search beside the lookup and the
  lists: the one shared picker behind Receive, Add line, New order, Set
  price, the recipe, Plan run and Movements' filter.
  `GET /v1/products/variants` takes `search`. The picker lists the catalogue
  before anything is typed and asks the server once the minimum is
  typed, waiting as the lists do and dropping an answer that arrives
  after a newer one.
- **Loading said, nothing found only once known.** While a picker asks,
  it shows that it is loading, and a screen reader hears it; "No
  matching items" comes only from an answer. The catalogue hook says
  whether it has answered, so no dialog says there are no products while
  they load (#250).

### Decision — the lookup's ranking, and one minimum everywhere

- **Products, Partners and the pickers rank as the lookup ranks:** an
  exact match first, then a match at the start, then anywhere; then by
  name. A SKU typed whole is first in a picker, not among twenty partial
  matches. The paged lists keep the order their keyset paging depends
  on.
- **One Chinese character is a search.** The minimum stays 2 characters,
  or 1 when it is a Chinese character: 鱼 alone is what a Chinese reader
  types. Neither length can use a trigram index, as 2 characters already
  could not, and the budget watches it. This amends "At least 2
  characters" above, for the lookup as well.

### Considered and not done

- **The pickers filtering in the browser,** with every name and its
  pinyin sent with the catalogue. Two places that match, and the pinyin
  is written only on the server.
- **Translations sent to the browser to choose from.** Every screen would
  repeat the rule this amendment keeps in one place.
- **Paging Products and Partners now.** Not needed while they load whole;
  Open decisions' "Product list pagination" keeps its trigger.

### Deferred

- **Why a row matched,** shown beside it (on pinyin, another language's
  name, a tax ID). A Chinese reader knows why "yuyou" found 深海鱼油, and
  it needs a design. Trigger: a reader who cannot tell why a row was
  found.
- **Covers in the pickers.** ADR-062 defers images on order lines and the
  shipping screen; the pickers wait with them. Trigger: picking errors a
  picture would have prevented.
- **Recent or most-used items first in a picker,** a question of what to
  remember per person, as recent and pinned records in the lookup are
  above. Trigger: someone picking the same few items over and over, or
  asking for it.
- **A search engine** stays deferred above, its trigger unchanged.
- **The pickers' whole catalogue,** read before anything is typed, its
  search kept to those rows (added as built). Trigger: an organization
  with thousands of variants, or a picker's first read over its budget.
  Then the picker shows only what the server finds.

### Consequences

- No migration: the pinyin columns and the trigram indexes exist.
- Server: the one name rule, used by every read the first step lists;
  `search` on products, partners and variants through the shared
  matching, ranked as the lookup; the minimum by script, in
  `common/search.ts`; the organization on the product export's and a
  price list's items' joins (#226).
- Client: Products and Partners through `useListSearch`; the shared
  picker searching the server, with its loading state; the catalogue
  hook saying whether it has answered.
- Tests: for Products, Partners and a picker, the cases this ADR's lists
  have (partial, case, accents, another language, pinyin, one Chinese
  character, the ranking, another organization's record not found); the
  reads that name an item, each asked in Chinese.
- Perf: budgets for `GET /products?search`, `GET /partners?search` and
  `GET /products/variants?search`, each with a plan probe, so a join not
  bounded by organization shows at the small scale; `seed:volume` rows
  for them. `seed:demo` already names products and partners in Chinese
  and French, and gains whatever the first step finds a screen lacking.
- Help: the Products and Partners guides say what their search looks
  in, in three languages; #261 writes the rest.
- Rules files for products, partners and search, through a
  `/rules-file` skill (ADR-087).
- Manual checks: a section for names in Chinese across the screens, and
  search by pinyin and by one character on Products, Partners and a
  picker.
- Riders: #250, #263's note wording, #270 with `package.json`'s
  `allowScripts`, #226's two joins. Already on the branch: the triage's
  working agreements, #225's known miss removed, and six buttons opened
  through `openDialog`. The pull request closes #260, #250 and #270.

### As built (#317, 29 October 2026)

Built step by step from a brief; where it differs from the decisions
above, this holds.

- **The reader's language** is Accept-Language, read through one
  decorator, `@AcceptLanguage()`, which documents it as optional on all
  44 operations that take it: 25 went from required to optional and 19
  gained it, nothing breaking and the revision unchanged. Services take
  the locale as an argument, null meaning the base name, so the packing
  slip and the CSV exports pass null through the same functions.
- **The product page** keeps `name`, which its edit forms fill from and
  send back, and shows `displayName`, with the base name first under
  Names in other languages. A Chinese reader's edit leaves the base name
  as it was (`server/test/item-names.e2e-spec.ts`).
- **The reads that name an item,** listed first and kept by that test,
  which also scans `openapi.json` for any read that names an item without
  the rule. Recipes, runs, RMAs, costs, availability and Movements show
  only a SKU and are unchanged here: #296, and Movements is #256's, in
  ADR-085's branch, not "met here" as "Kept in step" says. Recent and
  Home's welcome take the rule.
- **The minimum is the lookup's alone:** 2 characters, or 1 Chinese one;
  its `q` went to `minLength: 1`, refused by `validation.lookupQuery`, and
  the top bar's hint says the rule. The lists and pickers narrow from the
  first character, as the lists already did.
- **The ranking:** `itemRank` reads the SKU, the name shown and stored and
  the pinyin of each, a full pinyin or its initials counting as exact;
  `partnerRank` the name, code, tax ID and pinyin. The lookup uses both.
  Tone marks and full-width (全角) input are folded first.
- **The partner pickers too:** New order, Send a sample and Plan run
  search the server through one `PartnerPicker`, sharing
  `usePickerSearch` with the item picker; Plan run's "We make it
  ourselves" is a first row and the field's text, never a placeholder.
- **The lists keep their search in the address:** typing writes
  `?search=`, replacing the history entry; "Show all" while on the list,
  and Back and Forward, follow it. Switching language reads the open
  screen again (#297).
- **The joins to products** name the organization in ON, #226's two and
  six more, and so do the translation subqueries; the trigram indexes
  still find every organization's matches before the filter drops them,
  as the index per organization above defers.
- **The exports** of Products and Partners follow the list's search and
  filters (ADR-057).
- **Budgets:** `GET /products`, its search, the pickers' and Partners'
  searches, each with a plan probe, and one for 专 alone; p95 8 to 17 ms
  against 300 at small. The typo lookup (#225, reopened) and Home (#276)
  carry known misses until 30 November: CI's runners ran about 1.45×
  slower on 29 October, main as much as this branch.
- **Found and fixed on the way:** three tenancy checks, production runs,
  recipes and a run's release, through one `assertOwnIds` (ADR-003).
