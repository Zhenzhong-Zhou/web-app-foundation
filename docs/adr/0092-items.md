---
status: accepted
date: 2026-11-09
areas: [products, i18n, ui]
amends: [ADR-048, ADR-051, ADR-054, ADR-056, ADR-068, ADR-090, ADR-091]
---

# ADR-092 — Items: everything the company keeps, by type and category (amends ADR-048, ADR-051, ADR-054, ADR-056, ADR-068, ADR-090 and ADR-091)

## Context

On 6 November 2026 a reviewer who reads only Chinese, an accountant,
found the Products page a mess to work with (#476): one long list,
nothing ordering it by time or by category, and every kind of item in
it at once, what is sold beside raw materials, packaging, marketing
material, equipment and office supplies.

The app already keeps one list of items, as ERPs do, and each product
already has one of six types (ADR-023): good, material, packaging,
sample, supply and equipment. Nothing uses them: the page shows a name,
a type and a status, and the type changes no behaviour anywhere on the
server. `GET /v1/products` returns the whole catalogue, sorted by name
alone (Open decisions, "Product list pagination"). The list shows no
code, no stock and no date.

The same day the page was named: Items · Articles · 物品 for the page
and the menu, Products · 商品 kept for the goods it sells. The top bar's
lookup already calls the group 物品 and its Show all opens a page named
产品 (#149's comments), so two names for one thing end here.

It was planned on 8 and 9 November in the chat, with boards on the
Claude Design canvas in three rows: "物品 第一版 · Items v1", the first
answers; "物品 第二版 · Items v2", after the design language's check, in
three languages and both colour modes; and "物品 第二版：流程和状态 · Items
v2: flows and states", the wireflow, each piece's states, and the list
loading and failed (decision 18). The build follows v2 and its flows and
states, with the board for decision 19 at the end of v2's row, added on
9 November for #526. v1's boards for categories, the
types' names and the pickers stand in v2 unchanged.

### Checked before drafting

The areas `products`, `search`, `stock`, `orders`, `boms`,
`production-orders`, `home`, `database`, `help`, `i18n` and `ui`, and the
issues #467, #473, #476 and #505 (`scripts/adr-check.mjs 092`, 122 open
issues, 55 read whole). With them, the Deferred lines of the areas'
ADRs, ADR-051's watch list, Open decisions, ADR-091's panel reports
and the router's summaries.

**Fired, and taken here:**

- Open decisions' "Category and brand": its trigger fired on 6 November
  with #476. Categories are decided here; brand waits for its own.
- Open decisions' "Catalogue attributes deferred with their modules":
  category arrives as a product-level link; tax class, supplier,
  barcodes and images stay with their modules.
- Open decisions' "Product list pagination": "build it with the
  filters, once the client shows which filters matter". The type tabs,
  the categories and the sorts are those filters.
- ADR-091's Deferred "Which lists sort, and by what": its trigger is
  each list's own turn, the rule written with the first. Items is the
  first.
- ADR-062's "With no image: a neutral tile with the product type's
  icon", never built (#306's 22).
- #149's comments: 物品 in the top bar and 产品 on the page, and "Show all
  in Items" opening Products. The rename settles them.
- #305: a number inside a name sorts by its value, so 30 粒 comes
  before 120 粒.
- #526's second half, filed on 9 November after an order's PDF was
  refused: the item's page lists only the product's names, so a
  variation's missing name is invisible, and the refusal names the code
  but not which name is missing. Its first half, a refused PDF opening
  as raw JSON, is the documents', and stays on the issue.
- #306, the products rules file's findings: the thirteen the list, the
  form, the item's page and the export meet (Decision — what rides
  along).
- #308's 22, Items' part: Show all opens a list that hides what the top
  bar found. And its 29, which is #306's 20.
- #473's 5 (the whole row one link), 16 (sorting) and 29 (an export in
  the screen's words), for Items' list.
- #485's second half: the welcome's second step says "open Products"
  and is ticked only by opening one.
- #505's 54 with 90 (focus after a sort), 57 (the chips for what a link
  narrowed, built three times) and 58 (the search and the tabs writing
  the address by hand). Items would be the fourth copy of each.
- #33, one hook for Load more, every list's copy replaced; and #274, a
  shared select that names its empty choice in words, made here and used
  by Items, the other selects as their screens are next touched.
- #226's one-line fix: the Products export's French and Chinese name
  columns read `product_translations` with no organization in the
  subquery.
- #467's 13, 16, 18, 22's report fields and 30, since Items walks a
  panel.
- ADR-090's rules, applied to Items' screens without closing their
  issues: 44 px targets on touch (#170), cards below 600 px (#159), and
  filters behind one button on a phone (#481).

**Not fired, and left:**

- ADR-056's Deferred (the pickers' whole catalogue, recent items first,
  why a row matched, a search engine, fuzzy pinyin), ADR-062's (variant
  images, images on order lines), ADR-079's (search in the guides,
  screenshots in them) and ADR-090's (a list beside its record, the
  hinge, a test with real people, density): no trigger met.
- ADR-091's "Help hiding the steps a role cannot take": its trigger is
  Orders' turn.
- Open decisions' "Barcodes" (when something scans), "Industry
  vocabulary", "Bulk create and CSV import", "Field-level change
  history" and "Knowing which screens are used": no trigger met.
- ADR-051's watch "one Chinese character on a large catalogue" (40 ms
  of 100) stays, timed again by this branch; "Movements for one shelf"
  is ADR-093's.
- #391 and the other translation reviews (#371 to #423, #148 to #150,
  #398): the translations batch after Items reads the strings Items
  rewrites. Items' new strings follow the glossary.
- Inventory's and Orders' own findings (#472, #459, #352, #470, #409,
  #458, #160, #508, #479, #25, #177): their screens' turns.
- Home's files Items does not change (#502, #504, #510, #511, #512,
  #482, #489, #485's first half, #505's other items, #507).
- Screens Items does not change (#167, #296, #299, #261, #154, #308's
  others, #426, #492), and files it does not touch (#275, #282, #293,
  #295, #324, #475, #486 to #488, #490, #501, #513).
- #474, #509 and #473's Back keeping the place: a rule for every page,
  a change of its own.
- #314, #226's rule and #277: the new category write gets its own
  refusal of another organization's id, and its key an index; the
  general tests stay.
- #467's 12, 14, 17 and 25, and the `later` issues (#347, #461, #337,
  #478).

**Found while checking:**

- The type changes no behaviour anywhere on the server: tabs, pickers
  and the form by type are its first uses.
- Add product asks no price, since prices live on price lists, so
  #476's "a raw material asks no sale price" does not apply: the form
  by type changes lot tracking and its words.
- The list's answer carries no dates, so sorting by date added or last
  changed adds them; the table has both.
- Opening on Products would hide what the top bar's Show all found,
  which may be of any type and discontinued.
- The list shows the name alone, where the design language's Rows want
  the code after the name; all four of ADR-091's `home` personas met
  codes before names elsewhere.
- ADR-023 forks nothing on the type, so a type changed later is safe.
- "SKU" is one message, `products.sku`, so "Code" (编码) reaches every
  screen at once, as the design language's first principle asks.
- The rename reaches the glossary's Product row and about 80 strings
  (32 in Chinese, 46 in French).

## Decision — Items, the page and the menu

Items · Articles · 物品 is the page, the menu entry, the breadcrumb, the
top bar's group and its Show all, the Help guide, Getting started's step
and the welcome's, and the glossary. An item is anything the company
keeps; Products · Produits · 商品 is the goods it sells, and only that.
The address becomes `/items`, and `/products` and its pages send there,
so bookmarks keep working. The API and the code keep `products`:
renaming them breaks every client for no reader's gain. "SKU" becomes
Code · Code · 编码 everywhere, in the glossary first.

## Decision — the types as tabs, opening on Products

Seven tabs with their counts: Products, Raw materials, Packaging,
Supplies, Samples, Equipment and All, in that order. Items opens on
Products, or on the first type that has items. A type with no items has
no tab until it has one, except while a search is typed, when every tab
keeps its place and its count follows the search. Tabs that do not fit
go under More with their counts, never into a sideways scroll; on a
phone the tabs are one select, "Type: Products (128)". The top bar's
Show all opens All, with its search and with discontinued items
included, so what the top bar found is on the list.

The types are named in everyday words:

| Type | English | French | Chinese |
| --- | --- | --- | --- |
| good | Products | Produits | 商品 |
| material | Raw materials | Matières premières | 原材料 |
| packaging | Packaging | Emballages | 包装材料 |
| supply | Supplies | Fournitures | 耗材 |
| sample | Samples | Échantillons | 样品 |
| equipment | Equipment | Équipement | 设备 |

"Office supply" was narrower than what the type holds: gloves and
cleaning supplies are used up too. Help names the accounting classes
once, 耗材 being the accounts' 低值易耗品.

## Decision — equipment is counted and located, never stock value

Equipment stays an item type, with its own tab: it is received, moved
and counted where it stands. It is a fixed asset, not inventory, so it
is left out of stock value and of Home's Waiting for a cost (ADR-048,
amended). A fixed-asset register, with depreciation, is deferred.

## Decision — categories: one tree, one per item

Categories are a table, not a text column, nested as locations are, one
tree per organization: `product_categories`, each row with its name and
its parent, unique by name under one parent. An item is in one category
or none (Uncategorised), a nullable link on `products`. Choosing a
category on the list holds it and every category under it. The filter
offers only the categories that have items on the open tab, with their
counts, and Uncategorised; Manage categories at its foot opens Settings
› Categories. There, whoever may change items (`products.update`) adds,
renames and moves categories; a move under its own branch is refused;
a category that holds items or categories cannot be deleted until they
move, and the refusal says how many and what to do. Each change is
recorded in History, and the organization's export and closing carry
the table.

## Decision — a row: the name first, its stock read from Inventory

The list keeps what a person decides by; everything else is on the
item's page, one step away: its variants, photos, names in other
languages, stock by location, History, and later its barcodes. A row
holds the cover, or the type's icon; the name in bold with its code in
grey under it, or "3 variants" and their codes; the category; the stock
on hand; one date; and the whole row is one link, at least 44 px tall
on touch. Discontinued items are hidden until the Discontinued chip,
with its count, shows them alone.

The stock is never stored on the item. The list adds up Inventory's
cache, `stock_levels`, for the rows it shows, in the item's unit, right
aligned; variants in different units show their number of variants
instead. Low stock and Out, from the item's reorder points (ADR-085),
show beside the number in Home's words, colours and icon. The number
links to Inventory, filtered to the item. On a phone a row is a card:
the name, the code and the category, then the stock and its status.

## Decision — sorting, and the rule for every list

Items sorts by name, category, stock (fewest first) and date, by its
headers, and by one Sort list on a phone. Name is the default: a number
in a name sorts by its value, and a Chinese name by its pinyin, as
today. One date column shows last changed, and its header's menu
switches it to date added; the column shows the date the list is sorted
by. The sort and its direction stay in the address, and focus stays on
the header after sorting from the keyboard. The rule for every list
goes into the design language (ADR-090, amended): a list sorts on the
few columns a person decides by; its default is the one most asked,
named in the list's own ADR; a column that sorts looks so; a date
column shows the date the list is sorted by.

## Decision — fifty at a time, the counts from the server

The list reads fifty rows at a time, with Show 50 more, by keyset
paging, the cursor holding the sort's key and the id, as Open decisions
said; while a search is typed, the key is the match's rank, Products
ranking as the lookup does (ADR-056's amendment). Each tab's count comes
from the server with the first page, following the search, the
category and the Discontinued chip. The export is still every row
matching the list, not the rows loaded. One hook holds Load more for
every list (#33). The answer changes shape, so the API revision goes to
4 (ADR-081).

## Decision — several at once, with Undo

Whoever may change items sees a check box on each row, and one in the
header for the rows loaded. Ticking shows a bar, "3 selected", with Set
category and Discontinue. Set category asks which, then moves them;
Discontinue runs at once. Both can be undone, so both offer Undo in
their message, and neither asks first (the design language's Actions
that cannot be undone). Undo puts each item back as it was. Another
tab, a new search or a new filter clears the ticks, so nothing unseen
changes. Each item's change is recorded in History, at most 500 in one
request. A Viewer sees no check boxes.

## Decision — adding and changing an item by its type

Add item asks what it is first, the six types with a line each in
everyday words. From a type's tab that type is chosen already; from All
none is, and Add item with none chosen says so under the types. A
raw material, packaging, a product, a sample or a supply may track
lots; equipment is never offered lot tracking. A code already in use is
refused under its field, saying what to do next and opening the item
that has it. Once added, the new item's page takes the form's place,
so Back returns to Items, and the message says what was added.

On the item's page, Edit changes its name, description, category and
type. The type may change at any time, since it forks nothing (ADR-023):
the item moves to that tab and in the pickers' order; its stock, lots
and History stay; History records the change.

## Decision — each variation's names on the item's page

The item's page shows its names in other languages as one table: a row
for the product and one for each variation with a name of its own, a
column for each language the organization uses, the languages its
documents require marked so. A missing required name reads Missing,
with Add opening Edit names at that row, and a line at the page's top
says that documents holding it cannot print until it is added. Edit
names marks the required languages, and no longer says that a blank
language prints the base name where that language is required (#306's
18). A refused document names whether the product's name or the
variation's is missing, the variation by its code and its own name
(ADR-054, amended). Add item does not ask for the required names: the
new item's page, opening right after, shows what is missing.

## Decision — pickers put the task's types first

A picker lists the types its task uses first, each under its name, and
every other item under Other items, still there to choose. A sale:
Products and Samples. A recipe's components: Raw materials and
Packaging. What a run makes: Products. A purchase and a receipt group
by type with none first, since a wholesaler buys products too.

## Decision — how it behaves

Each feature from now on carries a wireflow board, an interaction table
in its ADR and each screen's five states. The pieces every screen shares
draw their states once: a States section in the design language and one
canvas row, in a docs pull request after this one and before Movements,
with ADR-090's amendment. Items does its own part here; its boards are
the canvas's "Items v2: flows and states".

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| The menu | Items | The list opens on Products, or the first type with items | Items | the page before |
| The top bar | Show all in Items | The list opens on All with the search, discontinued included, a chip saying so | Items | the page before |
| Items | A tab | The list reads that type; the search, category and sort stay | Items, that tab | the tab before |
| Items | A search, then a pause | The list and every tab's count follow; with none on this tab, the list says where the matches are, with a button there | Items | the list before the search |
| Items | A category | The list holds it and those under it; a chip shows it, its × removes it | Items | the list before |
| Items | A header | Sorts by it, again reverses; focus stays on the header; the date column shows what it sorts | Items | the sort before |
| Items | Show 50 more | The next fifty below; focus on the first new row | Items | — |
| Items | A row, anywhere | — | The item's page | Items as it was |
| Items | A row's stock | — | Inventory, that item alone | Items as it was |
| Items | Add item | The dialog, its type chosen from the tab, none from All | — | — |
| Add an item | Add item | Saved, "Added …" | The new item's page, in the form's place | Items |
| Add an item | Add item, the code in use | Refused under Code, with the item that has it | the dialog | — |
| Items | Ticks rows | The bar: how many, Set category, Discontinue, Clear | Items | — |
| The bar | Set category, then Move | The list reads again; "Moved 3 items to …", with Undo | Items | — |
| The bar | Discontinue | At once; "Discontinued 3 items", with Undo | Items | — |
| A message | Undo | Back as they were, recorded in History | Items | — |
| Items | Another tab or search, with ticks | The ticks clear | Items | — |
| The item's page | Edit, then Save | Saved; a new type moves it to that tab | the item's page | Items |
| The filter | Manage categories | — | Settings › Categories | Items |
| Settings › Categories | Delete, with items under it | Refused: how many, and to move them first | the page | — |

The five states of Items' list: as it should be; empty, saying what to
add first with Add item, or for a Viewer who can add; loading, its rows
as placeholders after 250 ms with the header kept, so a sort keeps its
focus (#505's 54); failed, the list's part alone saying it could not be
read, with Try again; and partial, no match on this tab, or Show 50
more failed with the rows kept, as the board "Items: loading and
failed" draws them (decision 18). The item's page and Settings ›
Categories have the same five, by the same words.

## Decision — what rides along

- **#306's thirteen:** 10, the Discontinued filter tested; 18, the
  required languages marked in Edit names; 20 and 21, the
  export following the list and holding every language's names; 22,
  the type's icon; 26, the type changeable; 29, the list's defaults
  stated; 30, a screen to rename an item; 33, the stale manual checks;
  34, an empty state that speaks of a search only when there is one;
  36, `name` meaning one thing in the API; 37, the guide caught up; 38,
  the export's refusal past 50,000 rows naming what it can narrow. 39's
  test changes with 26.
- **The rest of "Fired, and taken here",** each as its line says.

## Considered and not done

- **Tabs opening on All, or a Type filter instead of tabs.** The list
  would still open mixed, which is what the reviewer met.
- **Equipment in stock value, or in a register of its own now.** The
  first overstates inventory; the second is a module, with
  depreciation, nobody has asked for.
- **Several categories per item, or a tree per type.** Reports would
  count an item more than once; and a tree per type adds work the
  filter already saves, since it shows the open tab's categories alone.
- **Brand now, as a list or a text field.** Not what the report asked;
  the same shape as categories, one table, when its trigger comes.
- **Every column sortable, or two date columns.** On a laptop the name
  would keep half its width; a date sorted by is still shown.
- **The whole catalogue at once, or numbered pages.** Open decisions
  chose keyset paging for this list; numbered pages shift as rows are
  added.
- **The type fixed once added.** A wrong type would mean a new item and
  a new code.
- **Pickers showing only their task's types.** A surplus raw material
  could not be sold, nor a product bought to resell.
- **The accounting classes as the types' names** (库存商品, 低值易耗品):
  words a newcomer does not know; Help names them once.
- **The API renamed to `items`.** Every client breaks for nothing a
  reader sees.
- **No stock on the rows, or the number alone.** Small businesses' item
  lists show it (Odoo, Shopify, Zoho, inFlow), and a phone's card asks
  for the one number that matters.
- **Items changed one at a time, or by a spreadsheet import.** Sorting
  214 items into new categories is 214 edits; an import is Open
  decisions', with its own trigger.
- **Barcodes now, as a table or a column.** Nothing reads them until
  something scans, and a column holds one where a variant has several.
- **Each feature drawing every piece's hover and focus.** It repeats the
  shared states and drifts from them.

## Deferred — each with what brings it in

- **Brand,** a flat list and a filter. Trigger: someone asking to find,
  filter or price by brand.
- **Barcodes,** in their own table (Open decisions). Trigger: something
  that scans, receiving or picking.
- **A fixed-asset register** for equipment, with depreciation. Trigger:
  a customer recording equipment's value.
- **Categories' names in other languages.** Trigger: an organization
  working in two languages asking for them.
- **More changes to several at once** (the type, reactivating). Trigger:
  someone asking.
- **Ticking every match, beyond the rows loaded.** Trigger: a catalogue
  where Show 50 more to reach them all is slow.
- **Items opening on the tab last used.** Trigger: someone who works on
  another tab every day asking.

## Consequences

- **Amended:** ADR-048 (equipment not in stock value); ADR-054 (the
  item's page shows what documents will refuse, and the refusal names
  which name is missing); ADR-056 (Show all
  opens Items on All, discontinued included); ADR-090 (the rule for
  which lists sort, in `docs/design-language.md`'s Sorting and filters);
  ADR-091 (its Deferred "Which lists sort" taken).
- **Docs in this commit:** Open decisions' "Category and brand",
  "Product list pagination" and "Catalogue attributes deferred with
  their modules"; the design language's Sorting and filters; the
  handoff.
- **Server:** migration 0080, the categories table, the link on
  products and a numeric collation for names; categories' routes and
  their tests; `GET /v1/products` paged, filtered, sorted and counted,
  with the dates and the stock, the API revision at 4; the type
  changeable; several at once and their Undo; the export following the
  list; equipment out of stock value; the seeds.
- **Client:** `/items` and the redirect; the rename and Code; the shared
  hook for Load more, the chips, the address and the empty choice;
  Items' list, its tabs, filters, rows, cards, sorts, check boxes and
  bar; Settings › Categories; Add item and Edit by type; the pickers by
  type; every string in three languages.
- **Checks:** the interaction table, row by row, as browser tests; the
  five states; the manual checks and the products and search rules
  files; the before-and-after screenshots; ADR-051's list budget at
  small, before and after; the panel on a new `items` journey and on
  `buy`.
- **After the merge:** `npm run migrate:all` and the volume databases
  migrated; the planning skill uploaded if it changed; the docs pull
  request for flows and states, then Movements (#470, ADR-093).
- **Build order:** this ADR → the dependencies → the inventory → the
  small volume database seeded again and the figures before →
  categories → the list's read → changing items → equipment → the seeds
  → the rename → the shared pieces → Items' list → several at once →
  Settings › Categories → adding and changing an item → the pickers →
  the browser tests → Help, the rules files and the checks → the panel's
  riders and the `items` journey → the figures after → the dependencies
  again → the reviews and the panel → the pull request, closing #476,
  #305 and #33, and part of #274, #306, #308, #473, #485, #505, #526,
  #149, #226 and #467.

## Amendment (November 2026) — as built (#532)

Built on `adr-092-items` on 9 November 2026, 73 commits, from its brief
in `tmp/adr-092/`. Where building settled or changed what is above:

### Decided while building

- **A row's stock opens Inventory for that item alone** through a
  `productId` filter on `GET /v1/stock`, its counts, its export and
  `GET /v1/stock/availability`; another organization's item is a 400.
  Inventory shows the item as a chip, named by its rows, so it follows
  the reader's language.
- **Back after a tab, a search, a category or a sort leaves Items,** as
  every list does under #341's rule: each replaces the address rather
  than adding a step, and Forward brings Items back as it was. The
  interaction table's Back column for those four rows reads "the page
  before; Forward, as it was", and their tests say so.
- **Uncategorised has its count:** `GET /v1/products/categories` answers
  `uncategorised`, by type, beside the tree.
- **Categories go at most 10 levels deep,** as locations do: an add or a
  move deeper is refused with a 409 (`productCategories.tooDeep`). This
  replaces "nested, as locations are" above, which set no depth.
- **Set category opens with nothing chosen,** not on the category the
  ticked items share, so Move never starts on a place they already are.
- **A change to several answers each item's values before,** which Undo
  sends back to the same route: ADR-068, amended.
- **The figure beside Low or Out stays the stock on hand,** the status
  explaining itself where it links. The rule for a figure beside a
  status, on every screen, goes to the design language with the flows
  and states pull request.
- **The Code field says what a code is,** with an example by the type
  chosen (VITC-100, RM-VITC, PK-BTL90, SUP-GLV100, VITC-S10, EQ-CAP-01):
  "Your own code for this item, unique in your organization, such as
  RM-VITC. Not a barcode." Code is "what other systems call a SKU" once
  in each language's Items guide; the organization export's README
  calls its `sku` column the variant's Code.
- **The names table's base row** reads "the name it was added with, used
  in any language without its own name". Making the base name the name
  in the organization's language, so that a required language is not
  typed twice, is #531, planned with the translations.
- **Settings › Categories is explained in the Items guide,** where Help
  on that page opens it; there is no Settings guide.
- **One product for two markets:** the Items guide says how (one item, a
  variant per market with its own code, recipe, licence and names; a
  formula changed over time is a new recipe version on the same code),
  and `seed:demo` holds both cases: FOCUS-60-CA under Health Canada and
  FOCUS-60-CN under SAMR, 专注胶囊 60 粒; VITD-30-CA and VITD-30-EXP, two
  recipes under one licence, the same bottle, a different label each.
- **Inventory's rows, the name before the code,** are ADR-093's, with
  Inventory's other findings.

### Built differently from the text above

- **`product_categories.name_pinyin`,** a column the brief did not list,
  so a Chinese category sorts by its pinyin.
- **A category counts its own items;** the client adds up a branch, and a
  refused delete counts what sits directly in it.
- **The export hides discontinued items by default,** as the list does,
  and holds six name columns: the item's and the variant's in each
  language. Its old `?discontinued=true` is now a 400.
- **Discontinuing is recorded from and to in History,** so an Undo reads
  as one.
- **The types' words on the server are the tabs' plural names,** in the
  CSV and History; a singular name for one item waits for its issue.
- **An equipment lot's cost, or a run that used equipment,** is no longer
  marked Provisional because of equipment, since equipment waits for no
  cost.
- **"Code" replaced "SKU" on every screen, printed document, CSV header
  and History field.**
- **Show all in Items** opens `/items?tab=all&discontinued=include` with
  the search.
- **One hook for Load more:** every paged list uses it, Stock value's
  Waiting for a cost the last copy moved.
- **Items' heading has Export, Licences and Add item;** Refresh went, as
  the boards draw it. The Licences link waits for its issue.
- **On a phone,** a card's stock and status are a link of their own, and
  the cards carry check boxes; a sort clears the ticks, as a tab, a
  search and a filter do.
- **The width switches use `useMediaQuery`,** as Members does, where
  `.claude/rules/ui.md` asks for CSS `display`: drawn twice, every row
  would be read twice. For the design language's pull request.
- **Add item asks the Unit,** as the boards draw it, and keeps Size or
  variation and the description.
- **The names table has a column for each of the three languages,** and
  the item's page reads the organization and the categories besides
  itself.
- **The pickers:** a price list's follows its direction; a reorder
  point's and Movements' group like a receipt; an exact code leads only
  within its type's group; a row stays "CODE — name", with its type.
- **Variant, not Variation,** in the names table, its refusal and the
  guide.
- **An organization with no items reads the list twice on opening,** to
  learn which types it holds. Left for its issue.

### Measured

- **`GET /v1/products` p95 at small:** 22 ms before the branch, 26 ms
  after; by stock 31; with a search 16 before, 34 and 35 in two runs
  after. At large, on the 22 October seed migrated forward: 40 plain,
  36 by type, 67 by stock, 128 with a search, all inside 300 ms. A
  search now counts every tab and reads each row's stock, which passed
  ADR-051's watch on a large catalogue's search (ADR-051, amended).
- **Time against the brief:** steps 1 to 8 took 144 minutes of 200;
  steps 10 to 21, 227 of 400; the reviews, 269 of 210 (86 and 183). In
  all about 10 hours 40 minutes of the 13 planned. Opus steps used 100
  to 376 thousand tokens, two to three times the router's. No Sonnet or
  Haiku step was run again on Opus, so the model table holds.

### Deferred, added

- **A market on a variant,** Items' stock split by market, and a
  customer's market limiting the picker. Trigger: a customer selling one
  product in two markets asking for them.
