---
status: accepted
date: 2026-10-07
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
