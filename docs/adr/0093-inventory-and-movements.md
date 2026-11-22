---
status: accepted
date: 2026-11-14
areas: [products, stock, ui]
amends: [ADR-044, ADR-045, ADR-051, ADR-057, ADR-085, ADR-090, ADR-091, ADR-092]
amended-by: [ADR-094]
---

# ADR-093 — Inventory and Movements: one row per code, where it stands on the item's page, and a stock card (amends ADR-044, ADR-045, ADR-051, ADR-057, ADR-085, ADR-090, ADR-091 and ADR-092)

## Context

Inventory's Stock tab lists one row for each item, location and lot, so
an item held in three lots in one place takes three rows, and seeing all
of one item takes a search. "Promised to customers" is a second table
under the list (#481); a lot's code is not a link and the code comes
before the name (#472); on a phone the table cuts its key columns
(#159). Reorder points puts Position and Reorder point in two columns,
the trade's words where "12 left · reorder at 36" would read plainly,
and buying a row takes a tick and a button below the table (#459).

Movements keeps its filters in the page's memory, so a reload or Back
loses them; its rows carry no item, lot or document id, so nothing on
them links; and each Stock row's history dialog is a second, smaller
Movements. A reviewer reported a movement listed twice (#471, closed on
5 November as not reproduced): two movements of one order and one
quantity, shipped from two lots, read the same today.

Free and Low disagree. Free (ADR-045) counts expired lots and stock
issued to runs; usable stock (ADR-085) leaves both out. A sales rep read
可用 10 on Stock and 预计可用 58 on Reorder points for one item (#461),
and a row can read Free 50 and Out at once (#333). ADR-092 promised an
item's stock by location on its page; main's page shows none (#570).

The direction is #587, chosen on 14 November 2026 at the close of
`fix-ups-i18n`'s session: one row per item, lots by expiry, counts on the
filters. It was planned the same day in the chat, with two rows of
boards on the Claude Design canvas: "库存与库存变动 第一版 · Inventory and
Movements v1", ten boards, and "库存与库存变动 第二版 · Inventory and
Movements v2", ten more after the design language's and the principles'
check. v1's flows, states and one-place boards stand in v2, with the
counts and words v2's "What v2 changes" lists, and with the glossary's
words where a board's differ. The build is two branches,
`adr-093-inventory` and then `adr-093-movements`, each from `main` after
the one before merged, the first after #531, merged on 15 November as
pull request #595, whose base name in the organization's language every
row here reads.

### Requirements, as confirmed

The maintainer confirmed these on 14 November 2026, before drafting,
with the assumptions, what is not included and the questions' answers;
R1 and R8 were changed and R20 added the same day (10a to 12a), and R21
and R22 come from 11a, 18a and the third of the four adjustments. The
review of this text against production practice and the principles, the
same evening, sharpened R3, R16 and R21, as their rows say. R23 came on
15 November with #590, which the triage handed here with #534's first
half and #570 (21a). A step
is Inventory's brief's (I-) or Movements' (M-); the as-built of each
branch marks its own met, changed or deferred.

| R | What | Done when | Step |
| --- | --- | --- | --- |
| R1 | One row per code: On hand, Free, Held, Coming, its status in Home's words and what expires first. The figures add up: On hand is usable and not usable, Free is usable less Held, never below 0, and what confirmed orders want beyond it reads "20 short" | A server test checks each figure against the ledger and each sum holds | I-7, I-8, I-13 |
| R2 | A row opens to its places, a place to its lots, the first to expire first, by a button with its words and count ("2 places") | A browser test opens both; `aria-expanded` is true; the lots are in expiry order | I-6, I-13, I-18 |
| R3 | Filters with counts, Low stock, Out, Expiring soon, Expired and Waiting for a cost; and Type, Category, Location and search, all in the address | Each count is the rows its filter shows with the other filters on; a reload and Back keep every filter | I-9, I-13, I-18 |
| R4 | Group by Item, the default, or Lot; Home's Expiring soon opens the Lot view, soonest first, the expired on top | A browser test goes from the tile to the first lot | I-9, I-13, I-18 |
| R5 | "Promised to customers" goes, folded into each row's Free and Held (#481) | No second table is left, nor its route's caller | I-13, I-17 |
| R6 | The design language's rows on Inventory, the lot's trace and Stock value's Waiting for a cost: the name first and its code grey, "Code" for SKU, a lot's code a link, actions in words, every header named, the type's icon with its word, numbers in the page's format with their unit, money with its currency (#472's 6, 18, 24, 25 and 37; #546; #548) | The accessibility spec passes; a lot's link opens its trace | I-11, I-13, I-16, I-18 |
| R7 | Reorder, renamed, to the design language (#459): "10 left · reorder at 36" linking to the item's page, ADR-085's bar with its legend, the line above the table, Buy 30 and Make 1,000 opening a filled form, the ticked bar's "Buy 2 on one purchase order", the draft in its own cell, a greyed box's reason on screen, sorted by the suggested order; #538, #540 and #542 in its dialog | A browser test buys a low row and another plans a run, each from its filled form | I-15, I-18 |
| R8 | The item's page gains Where it stands, first under its title: per code On hand with what is not usable and why, Free, Held listing its orders, Coming listing its orders and runs with their days, Left with its sum in plain words, and By place and lot. Each part shown by permission, the server never sending what a reader may not see. A row's name, "10 left", "20 short" (at Held) and Items' Low and Out (#570) open it | Browser tests from each way in; a server test per permission | I-10, I-14, I-18 |
| R9 | A movement's row: When first, then the item's name and its code grey, a changed code's old one under it, the change with its unit, the reason, from → to, the lot with its expiry under it, the document it was for and who | A browser test opens the item, the lot and the document from a row | M-6, M-9, M-11 |
| R10 | Movements' filters in the address, the item picker's name first (#563), one date-range helper (#505's 59) | A reload and Back keep every filter | M-6, M-9, M-11 |
| R11 | An Inventory row, place or lot opens Movements filtered to it; the history dialog goes | A browser test from each; the dialog's file is gone | M-10, M-11 |
| R12 | The item's page lists its latest movements, with All movements | A browser test opens Movements filtered to the code | M-10, M-11 |
| R13 | Two movements that look alike say how they differ: lot, place, reason (#471's first cause) | A test lists two movements of one order and one quantity from two lots, each showing its lot | M-6, M-8, M-11 |
| R14 | Cards below 600 px for Stock, Reorder and Movements, the filters behind one Filters button on a phone; fewer columns from 600 to 899 px (#159, #472's 11 and 17, #481) | The cut-text test passes at 320, 390 and 820 px | I-6, I-13, I-14, I-15, I-18, M-9, M-11 |
| R15 | Exports in the screen's words (#473's 29); the recall list's export (#473's 17) | An export test reads the screen's headers and words | I-11, M-7 |
| R16 | Grouped and paged on the server, 50 codes at a time, each new sort with its index, timed at small and large against ADR-051's budgets, each new query in its plan check; Movements joins the budgets, with indexes on the from and to location | The budgets and the plan check pass, before and after in the as-built | I-4, I-9, I-20, M-4, M-5, M-13 |
| R17 | The canvas: a wireflow, each screen's states where they differ, a reading box on each board; an interaction table per screen in this ADR, each row a browser test | The two rows are on the canvas (14 November); each table's rows are tests | I-18, M-11 |
| R18 | Seeds: the demo with lots in two places, a changed code, held and coming stock, an expired lot in quarantine, a made item and an order shipped from two lots; the volume seed with lots and places per code, and movements per shelf | The seeds run, and the manual checks need no setup | I-12, M-8 |
| R19 | Help guides, glossary words, manual checks and a stock rules file, in three languages | The docs check, the Help test and the rules file's check pass | I-1, I-19, M-12 |
| R20 | One piece for each job: one rule for usable stock; one read for a code's figures, for Inventory, the item's page and Reorder; one movement row; one export-words helper; on the client one name-and-code cell, one lot link, the table-or-cards switch, one opening row and one Filters button. The pieces first, in commits that change nothing a person sees; one `when-touched` issue for the screens still to move | `/code-review` finds no new copy of 20 lines or more; one test reads a code through the three screens' routes and gets the same figures; the history dialog and the promised table are deleted | I-3, I-5, I-6, I-8, I-22, M-3, M-6 |
| R21 | Movements filtered to one code reads as a stock card: In · Out · Balance, a place chosen counting that place alone, and a date range opening with its balance at the start | A server test checks each row's balance and the opening balance against the ledger; the export writes the same columns and the opening balance | M-7, M-9, M-11 |
| R22 | The API adds before it removes: the grouped read is a new route beside `GET /v1/stock`, and the old route goes once nothing calls it, the API's revision raised once (ADR-081) | `npm run api` shows the new routes; a tab on the old revision is told to reload | I-9, I-17 |
| R23 | Items' stock read from Inventory's one count (#590): the quantity, its badge, and what the badge leaves out beside it; a Low stock filter on Items holding the out too, its count Reorder's and Home's (#534's first half); an item with several codes showing its worst code's status and how many | One test reads the three Low stock counts equal; a browser test filters Items by Low stock and opens an item's Where it stands; the filter inside ADR-051's budgets at large | I-10, I-14, I-18, I-20 |

- **Assumptions:**
  - A1: stock lives on variants (ADR-023), so a row is a code; for most
    items that is the item itself.
  - A2: the list shows every code with stock on hand, held, coming or a
    reorder point, so Out lists items at 0; Include empty shows the rest.
  - A3: Free, Held and Coming are figures the app works out already
    (ADR-045, ADR-085); the rule that changes is which stock Free counts
    (Decision — one rule for usable stock).
  - A4: Low and Out come from reorder points; an item without one has no
    status (#534 stays its own issue).
  - A5: sorted by name by default, and by On hand, Free and Expires
    first; the Lot view by expiry; Reorder by the suggested order.
  - A6: a reader who cannot see places (ADR-080) sees totals and lots,
    never a place's name.
  - A7: Movements keeps its page in the menu; #471 stays closed, its
    second cause, a write sent twice, waiting for ADR-041's deferred
    guard.
  - A8: one ADR, the first commit of Inventory's branch; Movements'
    branch adds its own as-built.
- **Not included:**
  - N1: #409, a site or warehouse as a place to filter by, a summary by
    place, and holding a member to some places.
  - N2: Orders' tables, heading and filters, and #473's other lists:
    Orders' turn.
  - N3: #310's nine dialogs with #295: after Movements.
  - N4: Back restoring loaded pages and scroll (#473, #509): a rule for
    every list.
  - N5: #534, lot labels (#441), expired lots' picking half (#333), a
    tree grid, barcodes, and renaming `product` in the code (#553).
  - N6: stock on a past date, such as a month's end.

### Checked before drafting

The areas `costs`, `locations`, `products`, `search`, `stock`, `api`,
`help`, `i18n` and `ui`, and the fourteen issues the plan names
(#587, #470, #472, #459, #409, #546, #563, #481, #473, #159, #160, #534
and #570, with #333 added after 10a, and #590 and #594 on 15
November), read by `scripts/adr-check.mjs 093`: first on 14 November,
104 open issues and 76 read whole, on `main` at 4bcc15c5; then again on
15 November on this branch, at ffe298d9 after #595 and #597, 110 open
issues and 81 read whole, which added #588 to #594. With them, the Deferred lines of the areas' ADRs,
ADR-051's watch list, Open decisions and ADR-091's panel reports for
Inventory, every finding in them already in an issue.

**Fired, and taken here, in Inventory's branch:**

- #472 whole, with its comments: the rows, the cards, and the lot
  trace's numbers and currency.
- #459 whole (5a, 6a, 19a), with #538, #540 and #542 in the Add reorder
  point dialog.
- #570, Items' Low and Out opening the item's page; #461's item-page
  half; #478's Inventory part, Expired a filter of its own.
- #590, Items' badge and quantity from one count, with #534's first
  half, a Low stock filter on Items (21a); #534's second half, an item
  at 0 with no reorder point, stays on #534.
- #594's two lines on files this branch changes: the item's page's two
  buttons named Edit, and Items' "0 each" link and a variant's code at
  36 px.
- #333's promise half (10a), amending ADR-045.
- #546 whole, the type's icon on stock rows and in the search box, and
  #548's last part, the type as a word beside its icon.
- #563, the pickers' name first; #578, a filter's chip removed by Enter
  and Space; #544, Load more's failed page for every list, Items' own
  copy removed.
- Inventory's parts of #481 and #159; #473's 5, 16, 17 and 29 on these
  lists, its 17 the recall list's Export, which ADR-044 deferred and a
  reviewer asked for; #479's lot half, the days since a lot expired;
  #296's costs part.
- ADR-057's "More sortable columns": the sorts were asked for, so each
  comes with its index and its timing.
- The simplify riders: #352 whole; #551's 60, one paging engine, since a
  sort by a worked-out figure needs one, with its 62, 64 and the stock
  list's joins; #282's `useLocations` hook and its movement test
  builder; #566's small text, #170's small targets and #561's contrast
  tests for the pieces these screens use.

**Fired, and taken here, in Movements' branch:**

- #470 whole; #274's select on Movements; #505's 59, one date-range
  helper; #282's movement extracts its triage of 15 November listed, a
  movement's four cells with their heads and the `movement()` test
  builder.
- ADR-051's watch "Movements for one shelf" (9a): it joins the budgets,
  so its trigger fires, and the indexes on the from and to location come
  with it.

**Not fired, and left:**

- ADR-085's Deferred, a point per place, lead times, a CSV import,
  email, preferred suppliers and packs: no trigger met.
- ADR-041's guard against a write sent twice (#471's second cause);
  ADR-045's holds on lots; ADR-044's batch quantities; ADR-042's samples
  filter; ADR-055's charts; ADR-048's period close.
- ADR-090's Deferred, and Open decisions' row-scoped access, barcodes,
  pallets, capacity, a site's purpose and whole units: no trigger met.
- #409 (3a, 20a).
- #333's picking half, #331 and #442: with expired lots, the handoff's
  next step after these two.
- #310, #295 and #541: they wait for the nine dialogs' shared hook.
- #156 and #160: they wait for Ship and Receive, which this plan does
  not change.
- #534 needs a decision on its timing budget; #553, #552, #441, #281 and
  #356 have no trigger met.
- #474, #509, #565 and #473's Back: a rule for every page, a change of
  its own.
- From the second check: #589, the names table on a phone, `fix-now` in
  the Fix-ups milestone, its own fix; #591 (a type's empty category
  message), #593 (`subtitle2` in files this plan does not change), and
  #588 and #592 (Documents); #594's lines outside this plan's files;
  #598, the account page's own fix.
- #566's raised field label (a design-language amendment), #582's Orders
  part (Orders' turn) and #461's "free by a date" (an ADR-045 decision):
  each needs its own decision first.

**Found while checking:**

- ADR-090 deferred a state machine for a flow until a screen's
  interaction table passes about 15 rows. Stock's has 12; each screen's
  stays under, so it stays deferred (14a).
- #461 shows the rule's gap from a reader's side: 可用 10 beside 预计可用 58.
- #471 was not met again, so it stays closed; R13 makes its first cause
  read apart.
- A new list of choices in the API takes its order from a constant
  (#328's proposal), so the API document does not reorder itself.
- #352's typed columns change types only: no migration.
- The holds' supply is one query for the list and for the check that
  guards a shipment (`availability.ts`), so the usable rule reaches the
  guard too (Decision — one rule for usable stock).
- `docs/rules/` has no stock file; `.claude/rules/stock.md` has Claude
  Code's paths for it.

## Decision — one ADR, built as two branches after #531

One ADR for both screens (1a), since they were designed together and
the item's page shows both where an item stands and what moved. Built as
two branches (12a): `adr-093-inventory`, then `adr-093-movements`, each
from `main` after the one before merged. Both read every name through
`namesIn`, the rule #531 changes, and a branch begun before it would
read the old rule, then be redone. Each branch has its own pull request,
reviews and as-built amendment here.

## Decision — a row per code, opening to its places and lots

- **One row per code (2a):** each variant is counted, held and
  reordered on its own, as NetSuite, Shopify and Cin7 keep stock. A
  row: the item's name, its code grey with the type as a word beside
  its icon; Where; On hand; Free; Held; Coming with its day; Status with
  the line it judges; Expires first; and Actions.
- **A row opens by a button, not a chevron alone:** "2 places", then
  each place's "2 lots", WAI-ARIA's disclosure pattern
  (`aria-expanded`), the opened rows after it. Its name says what it
  shows ("Show where Vitamin C 500 mg, 100 tablets is"); open, it reads
  "Hide"; focus stays on it while the rows below read, "Reading…" past
  250 ms. A reader without `locations.view` gets "2 lots" straight.
- **Lots by expiry, the first to expire first,** as stock is picked, a
  lot with no expiry after those with one; "Expires in 3 days" on a row
  and on its lot, one wording; "Expired 4 days ago" beside the date
  (#479).
- **A click elsewhere on the row opens the item's page,** the name its
  one link (the design language's Rows); "2 places" only opens.
- **A code that changed (7a)** shows today's name and code, the old one
  under it, "was VITC-90": the ledger keeps what was true, and today's
  item is easy to find.
- **A row in a place not usable says why:** "Not usable: a quarantine
  place", in the critical tone.

## Decision — group by item or lot; one place now

- **Each filter's count is the rows it shows,** with the other filters
  on and its own off, as a faceted search counts; the five in one
  statement. Expired is part of Expiring soon, as Home's late is part of
  its tile (ADR-091): "Expiring soon 3" and "Expired 1" do not add up,
  and Help says so.
- **Group by Item, the default, or Lot (3a):** the Lot view is one row
  per lot, soonest first, the expired on top, with the same filters,
  taking in today's expiring view. Home's Expiring soon opens it
  (ADR-091 amended).
- **Location filters by one place that holds stock (20a):** the list
  keeps what is there, each header saying "here"; Free and Held stay the
  whole item's, since a confirmed sale holds the item and not a shelf
  until it ships (ADR-045), each row saying so and linking to its page.
  The places group by warehouse in the list; a whole warehouse or site,
  and a summary by place, are #409's.

## Decision — one rule for usable stock, and figures that add up

- **Free counts usable stock alone (10a):** stock at places marked
  available, less lots expired by the organization's today and what
  released runs were issued, the rule ADR-085 already reads
  (`usableByLocation`). Holds draw on it, the earliest confirmed first,
  as ADR-045 orders them, so the row's figures and its status come from
  one rule. #333 keeps its picking half: which lot a shipment takes.
- **The guard reads it too:** the holds are one query for the list and
  for the check that guards a shipment. A shipment that would take
  expired or issued stock another order needs is refused, which a
  regulated product's rules want, and the refusal says what to do next:
  how many of the item are expired or issued, linking to its Where it
  stands. A shipment `main` allows and this refuses for any other reason
  stops the build for a decision.
- **The figures add up (R1):** On hand is usable and not usable, each
  part said; Free is usable less Held, never below 0; what confirmed
  orders want beyond what they hold reads "20 short", in the critical
  tone, a link.
- **Held · Réservé · 已预留 (17a),** the glossary's word: one name for one
  thing. It is Shopify's and NetSuite's Committed and Odoo's Reserved.
- **"20 short" opens the item's page at Held (16a),** focus on it, its
  orders listed oldest first, the last confirmed the one short. One home
  for one item, and no new filter on Orders.

## Decision — where it stands, on the item's page

- **Where it stands is the first section under the title (4a),** since
  someone who knows the trade looks there first (#461). Per code, the low
  first: the status and "10 left · reorder at 36"; On hand, with "12 not
  usable: expired, in quarantine"; Free, "what you can still promise";
  Held, listing its orders; Coming, listing its purchase orders and
  runs with their days; Left, "30 usable + 0 coming − 20 for orders";
  By place and lot, each lot's code a link with Move; and Change reorder
  point with Buy 30 or Make 1,000. Its latest movements come in
  Movements' branch.
- **Each figure lists what is behind it,** each a link: what a number
  counts is one step away (the design language's Numbers).
- **Ways in:** an Inventory row's name or the row; "10 left · reorder at
  36" at Where it stands; "20 short" at Held; Items' Low and Out (#570).
- **Shown by permission, never sent past it** (ADR-080). The section
  needs `stock.view`; place names `locations.view`; Held's orders and
  Coming's purchase orders `orders.view`; Coming's runs
  `production.view`; Change reorder point `stock.reorder`; Buy
  `orders.create`; Make `production.create`; Move `stock.move`. Without
  a part the server leaves it out of the same read, as a `GATED_INSIDE`
  route does; the number stays where the reader may see it ("Held 20 ·
  for 2 orders"), the documents' names do not. A main action the role
  cannot use says who can and whom to ask ("Buying is for Admin. Ask
  Demo Owner."). A not-usable lot, for a reader without places, is one
  line, "Not usable 12", so the figures still add up; the v1 board left
  it out.
- **One read:** Inventory's row, Where it stands and Reorder's row read
  a code's figures through one function, and one test reads one code
  through the three screens' routes and compares them.

## Decision — Items' stock from the same count (21a)

- **The quantity and its badge agree (#590):** Items' row shows on hand
  from the one read, and where part of it is not usable it says so
  beside it, "72 · 72 not usable", so Out beside 72 reads as true. The
  badge opens Where it stands (#570).
- **An item with several codes** shows its worst code's status and how
  many share it, "Low · 1 of 3 codes", and Where it stands lists the low
  first.
- **A Low stock filter on Items (#534's first half),** beside
  Discontinued and counted like it, holding the out too, as the
  glossary's Low stock does on Home's tile and on Reorder. It starts
  from the items with a reorder point, as Reorder's read does, so its
  cost grows with the points set, not the catalogue: #534's question of
  a status filter within ADR-051's budgets, timed at large. One test
  holds Items', Reorder's and Home's counts to one number.
- **Not usable in Chinese is 现有不可用 (22a),** so 现有 reads as 现有可用 and
  现有不可用 together, the reason beside it in the app's words: 已过期,
  已领用, 不可发货.

## Decision — Reorder, buying and making what is short

- **The tab is Reorder · Réapprovisionner · 补货 (6a),** named for what is
  done there, as Odoo's Replenishment is; the setting keeps its word,
  reorder point · 库存下限. Home's Low stock opens it with Low stock
  chosen, the tile's word. The address's old `tab=reorder-points` still
  opens it.
- **The whole tab to the design language (5a):** one line above the
  table, "Buy or make what is short. Tick several to buy them on one
  purchase order."; "10 left · reorder at 36" linking to Where it stands;
  ADR-085's bar unchanged, its scale twice the point so the mark is in
  the middle, amber when low, green when enough, empty and outlined red
  when out, with its legend; Bought or Made with how it orders, in the glossary's words: "Bought ·
  just enough", or "Bought · a fixed quantity of 12", its suggestion
  "60, 5 × 12" as today's. The v2 board's "in cases of 12" said more
  than the app knows: purchase packs are ADR-085's Deferred; the draft and its quantity in one cell, a link; a box
  that cannot be ticked says why beside it; sorted by the suggested
  order, most first (#473's 16).
- **Each row's button says what it makes and how many (19a):** Buy 30 ·
  采购 30 on a bought row, Make 1,000 · 生产 1,000 on a made one. It opens
  its form filled in, the supplier asked first, and nothing is saved
  until it is confirmed; ticked rows share "Buy 2 on one purchase order",
  the same verb.
- **The colour is not alone:** the Low or Out chip and "10 left ·
  reorder at 36" carry the status beside the bar, so ADR-085's colours
  stay.

## Decision — Movements: a log, filtered in the address, a stock card for one code

- **When first (18a):** a log in time order, as Odoo's Moves History,
  NetSuite's inventory activity and a paper stock card start with the
  date. Then the item's name and its code grey; the change with its
  unit; the reason; from → to; the lot with its expiry under it; For,
  the document, a link; By.
- **Filtered to one code, In · Out · Balance (11a, 18a),** as a stock
  card (库存台账: 日期 · 摘要 · 收入 · 发出 · 结存) reads, answering "why does
  this shelf say 42". Across every place a move between two of the
  code's places is neither In nor Out and the balance holds; with a place
  chosen, the move out reads Out there. A reason filter alone gives no
  balance, since it leaves movements out; a hint says to choose one item.
- **The balance is worked back from today's on hand:** each row's
  balance is today's, less what moved after it, in one fixed order, the
  time and then the id, so two movements in one minute keep their order
  and a page reads only the movements newer than it, never the whole
  history. A date range opens with its balance at the start, Opening
  balance · Solde d'ouverture · 期初结存, the last row of its last page
  and the export's first, as a stock card for a period has it.
- **The filters live in the address:** item, place, reason and days,
  one date-range helper, the item picker's name first.
- **The history dialog goes (8a):** an Inventory row, place or lot opens
  Movements filtered to it, one record of movements, and Back works.
- **Movements joins ADR-051's budgets (9a),** for one shelf at small and
  large, which brings the watch's indexes on the from and to location, a
  migration in Movements' branch.

## Decision — built from shared pieces, each made once

- **Server:** one rule for usable stock; one read for a code's
  figures; one movement row, `movement-view.ts` grown, for Movements,
  the item's page and the exports; one helper for an export's words; one
  paging engine for a sort by a worked-out figure (#551's 60).
- **Client:** one name-and-code cell, for Items, Inventory, Movements
  and the pickers; one lot link; Items' table-or-cards switch, reused;
  one opening row, also Where it stands' By place and lot; one Filters
  button for phones.
- **The pieces first (15a):** each in commits of its own that change
  nothing a person sees, before a feature uses it; this plan's screens
  move to them, and the others when they are next touched, listed in one
  `when-touched` issue so none is forgotten.
- **Done when** `/code-review` finds no new copy of 20 lines or more, the
  history dialog and the promised table are deleted, and the one test
  holds the three screens' figures equal.

## Decision — the API adds before it removes

The grouped read is a set of new routes beside `GET /v1/stock`, so a tab left
open across a deploy keeps working:

- `GET /v1/stock/by-code`, a row per code, with its counts at
  `GET /v1/stock/by-code/counts` and its export;
- `GET /v1/stock/by-code/:variantId/places`, a code's places and their
  lots, read when a row opens;
- `GET /v1/stock/by-lot`, the Lot view, with its export;
- `GET /v1/products/:id/stock`, Where it stands, gated inside.

Each declares exactly its shape (ADR-068): a row per code and a row per
lot are two shapes, not one with optional fields. Each new query joins
ADR-051's plan check, so a scan of a large table fails the build.

The old routes go in the same branch once no screen calls them, and the
API's revision rises once with them, which tells a tab still on the old
one to reload (ADR-081); a caller outside the app's own client would
keep them for a release. Every new field in a response is additive;
`npm run api` writes each into the client.

## Decision — how it behaves

The wireflow is v1's "流程 · the flows" board; the tables are v2's
"交互表 · the interaction tables", which replace v1's table for Stock.
One table per screen, each screen's state in the address (14a); each row
is a browser test.

**Stock** (Inventory's branch):

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| Stock, by item | Low stock 3 | The list narrows to 3, the count kept; `?low=1` | Stock, Low stock chosen | the list before the filter |
| Stock, a row | 2 places | Its places open below it; the button reads Hide, focus kept; `?open=` gains its code | the same list, the row open | the row closed |
| Stock, a place | 2 lots | Its lots open, soonest first; "Reading…" on the button past 250 ms | the same list | the lots closed |
| Stock, a row | Its name, or elsewhere on the row | The item's page, focus on its title | the item's page | Stock as it was, focus on that row |
| Stock, a row | 10 left · reorder at 36 | — | Where it stands | Stock as it was |
| Stock, Free | 20 short | The item's page at Held, focus on it, the waiting orders listed | the item's page, Held | Stock as it was |
| Stock, a lot | Its code | — | the lot's trace | Stock as it was, the rows open |
| Stock, any row | Actions › Movements | Movements for that code, and that place or lot from their rows (Movements' branch) | Movements, filtered | Stock as it was |
| Stock | Group by › Lot | One row per lot, soonest first; the filters kept; `?group=lot` | Stock, by lot | by item |
| Stock | Location › Shelf A2 | Only what is on A2, "here" in each header; Free and Held the whole item's | Stock on Shelf A2 | Everywhere |
| Stock | Show 50 more | The next 50 codes, focus on the first new row; failing, the rows kept with Try again | a longer list | leaves the page (#509) |
| Stock | Export | Every row the filters match, in the screen's words; History keeps the filters | a CSV file | — |

**The item's page** (Inventory's branch, but its last row):

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| The item's page | Arrives from a link | Where it stands first under the title; focus on the title | the item's page | where the person came from |
| Where it stands | Buy 30 | A purchase order opens filled in, the supplier asked first | a new purchase order | the item's page; nothing saved |
| Where it stands | Change reorder point | The reorder point dialog, filled in | a dialog | Escape closes it, focus back on the button |
| Held | SO-000014 | — | the order | the item's page at Held |
| By place and lot | A lot's code | — | the lot's trace | the item's page |
| Latest movements | All movements (Movements' branch) | Movements for this code | Movements, filtered | the item's page |

**Reorder** (Inventory's branch):

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| Home | Low stock 3 | Reorder opens with Low stock chosen, the tile's word | Reorder, Low stock | Home, focus on the tile |
| Reorder, a row | Buy 30 | A purchase order filled in with this item and 30; nothing saved yet | a new purchase order | Reorder as it was |
| Reorder, a row | Make 1,000 | Plan a run, filled in; nothing saved yet | a new run | Reorder as it was |
| Reorder | Ticks two rows | The bar names them and their quantities, with Buy 2 on one purchase order | the same list | ticks kept until Clear or a new filter |
| Reorder, the bar | Buy 2 on one purchase order | One purchase order, both lines filled in | a new purchase order | Reorder, ticks kept |
| A new purchase order | Saves it as a draft | "Draft saved. Confirm it to send."; its page in the form's place | the draft | Reorder, the rows reading "Drafted in PO-000015 · 30", ticks cleared |
| Reorder, a row | Drafted in PO-000014 · 60 | — | the draft | Reorder as it was |
| Reorder | Sort › Suggested order | Most to order first; `?sort=suggested` | the same list, sorted | the sort before |

**Movements** (Movements' branch):

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| Movements | Item › Vitamin C | In · Out · Balance replace Change; `?item=` | Movements, one item | every item |
| Movements, one item | Place › Shelf A2 | In, Out and Balance count Shelf A2 alone; a move out reads Out | Movements on A2 | every place |
| Movements, a row | The item's name | — | the item's page | Movements as it was, its filters and pages loaded |
| Movements, a row | A lot or a document | — | the lot's trace, or the order, run or receipt | Movements as it was |
| Movements | When › Last 30 days | The range in the organization's days; `?from=` and `?to=` | the same list | the range before |
| Movements | Export | The rows the filters match, the same columns, in the screen's words | a CSV file | — |

**The five states,** each drawn on v1's "状态 · states" board only where
it differs from the design language's States section:

- **Stock:** first use, "No stock yet." with Receive stock, or the line
  for a role that cannot; no results naming the filters on, one button
  clearing them, each chip's × by Enter or Space too (#578); done, Low
  stock at 0, "Nothing is low.", naming the items with no reorder point;
  loading, the header kept and placeholder rows, so a sorted header keeps
  its focus; failed, never an empty list, the filters kept without their
  counts until a read answers; partial, an opened row's places or the
  next 50 not read, said beside them with Try again.
- **The item's page:** none on hand and no reorder point, the next step
  by role, each button its line for a role without it.
- **Movements:** first use, "Nothing has moved yet." with Receive stock;
  the balance hint while more than one item is listed.
- **A new piece, the button that opens a row,** with six states: rest,
  hover, focus, pressed, open (the accent, the arrow up, "Hide …") and
  busy ("Reading…"); 44 px on touch by its padding; its contrast pairs in
  #561's table. The design language's Each piece's states gains its row
  (ADR-090 amended).

## Decision — held to the principles and to production practice

Each of `docs/principles.md`'s, and where this ADR meets it; the
design language's patterns are named in the decisions above.

| Principle | Here |
| --- | --- |
| Every refusal says what to do next | A box that cannot be ticked says why beside it; a main action the role cannot use names who can and whom to ask; a shipment refused for expired stock says how many and links to Where it stands |
| Numbers are exact | Decimal strings to the screen; one read for a code's figures and one test holding three screens to it; the figures add up on every row; the balance worked on the server |
| Nothing is lost silently | The history dialog and the promised table go, each with its figures kept elsewhere; Buy and Make save nothing until confirmed; a changed code keeps its old one in view |
| A newcomer finishes the common tasks without training | Buy 30 and Make 1,000 say what and how many; "20 short" opens who is waiting; the `stock` journey walks it with a reader of Chinese alone |
| Every screen works in every language the app speaks | Every string in three languages, the glossary first; French, dark and 820 px drawn; the cut-text test at three widths |
| Everyone can use it | The opening row is a disclosure button with words; colour never alone, the chip and the line beside ADR-085's bar; 44 px on touch |
| Each organization's data is its own | Every join names the organization; each route declares its shape; Where it stands leaves out what a role may not see |
| Fast enough to forget | The grouped read and Movements in the budgets at small and large, each new query in the plan check |
| Decisions are written down | This ADR, its requirements mapped to steps, and an as-built per branch |

Against production practice: stock per variant and lots soonest first
(NetSuite, Shopify, Cin7); free as usable less committed, the expired
left out; Buy and Make as Odoo's replenishment routes; a ledger and a
stock card read by date with an opening balance; a disclosure button
for rows that open (WAI-ARIA); routes added before the old ones go
(ADR-081).

## Decision — what rides along

Every rider in "Fired, and taken here" (13a): each touches a file this
plan changes, and the DRY ones remove copies that would otherwise grow.
Each issue closes with the branch that takes it whole, and the others
are named in the pull request as taken in part.

## Considered and not done

- **One row per item, its variants opening first, or summed when they
  share a unit (2b, 2c).** Four levels to open, or a sum that holds for
  some items and not others; a code is what is counted and reordered.
- **Group by Location now (3b, 20b).** A warehouse's total needs #409's
  sum over its places, left for later.
- **#333 whole, as its own branch first (10b), or Free as today with
  the expired named beside it (10c).** The first delays both screens for
  the picking half nobody asked for now; the second keeps two rules for
  one number.
- **The history dialog redrawn (8b).** Two records of movements, and a
  dialog Back cannot return to.
- **Movements timed once by hand (9b).** A shelf's movements would go
  unwatched as they grow.
- **"Promised" for Held (17b).** The glossary's word in three languages
  changed for a synonym.
- **Orders filtered by item for "20 short" (16b).** A new filter on
  another screen, where the item's page already lists the orders.
- **Movements with the item first (18b), or day headings (18c).** A log
  reads by its date, and a heading hides the date from a row read alone.
- **"Raise a purchase order" and "Plan a run" in full on every row
  (19b).** Longer, and they say neither what nor how many.
- **A state machine for Inventory (14b).** The address already holds the
  state; each table stays under ADR-090's 15 rows.
- **Every screen moved to the shared pieces now (15b),** or only the
  issues the prompt named (13b). A branch that changes every list, or
  copies that keep growing.
- **A tree grid.** A disclosure button is what screen readers support
  well; a grid's keys are a burden for a list read top to bottom.
- **A grey bar for Reorder.** Drawn in v2 and taken back the same day:
  the chip and the line beside the bar carry the status, and ADR-085's
  colours are what people already read.

## Deferred — each with what brings it in

- **A whole warehouse or site as a place, a summary by place, and a
  member held to some places (#409).** Trigger: a customer with stock in
  more than one site asking, or ADR-080's row-scoped access.
- **Stock on a past date,** such as a month's end. Trigger: someone
  asking for it, a closing or an audit.
- **Which lot a shipment takes (#333's picking half).** Trigger: expired
  lots' turn, the handoff's next step after these two.
- **Free by a date (#461).** Trigger: someone promising stock that is
  coming by a day, which needs an ADR-045 decision.
- **A preferred supplier per item,** so Buy asks no supplier. Trigger:
  ADR-085's.
- **A state machine for a screen.** Trigger: a screen's table past
  about 15 rows (ADR-090).
- **Back restoring loaded pages and scroll (#509, #474).** Trigger: its
  own change, for every list.
- **The guard against a write sent twice (#471's second cause).**
  Trigger: ADR-041's.
- **Values on the stock card,** the cost in, out and of the balance, by
  `costs.view`. Trigger: an accountant asking for the amounts, or
  ADR-048's period close.

## Consequences

- **Amended:** ADR-044 (the recall list's export, and a lot's expired
  days); ADR-045 (Free from usable stock, the guard with it); ADR-051
  (the grouped read and Movements in the budgets, the watch's indexes
  taken); ADR-057 (Inventory's and Movements' sorts, each with its
  index); ADR-085 (the tab renamed Reorder, Buy and Make, Left's sum in
  words); ADR-090 (the opening row in Each piece's states; the Rows and
  Numbers lines that waited for this); ADR-091 (Expiring soon opens the
  Lot view, Low stock the Reorder tab); ADR-092 (Where it stands on the
  item's page, and Items' Low and Out opening it).
- **Docs in this commit:** the glossary's new words (Short, the line's
  Backordered; Not usable, 现有不可用, the pair of Usable's 现有可用 and never
  bare 不可用; Where it stands; Group by; Expires first; In, Out and
  Balance; Opening balance; Reorder; Left, the line's Position; Buy and
  Make), the design language's lines, the README's and the planning
  skill's packer's words for its upload, now a plugin's Edit, and the
  handoff.
- **Server, Inventory's branch:** one usable rule; one read for a code's
  figures; the grouped route, its counts and sorts, paged by 50, with an
  index for each sort and a migration only if one needs it; Where it
  stands' read by permission; the exports in the screen's words and the
  recall list's; the old route removed and the API's revision raised;
  the seeds.
- **Client, Inventory's branch:** the shared pieces; Stock, its rows,
  opening rows, filters, groups, one place and cards; Where it stands;
  Reorder; the promised table removed; every string in three languages.
- **Server, Movements' branch:** the migration with the two indexes;
  the movement row grown; the filters; the stock card; the seeds.
- **Client, Movements' branch:** Movements' rows, filters in the
  address, cards and the stock card; Inventory's Actions › Movements;
  the history dialog removed; the item's page's latest movements.
- **Checks:** each table's rows as browser tests; the five states; the
  cut-text test at 320, 390 and 820 px; the accessibility spec; one test
  per permission; the consistency test; the budgets before and after; a
  new `stock` journey for the panel, with `buy` and `trace`; the manual
  checks; a stock rules file.
- **After each merge:** `npm run migrate:all` and the volume databases
  migrated where a migration came; Movements' branch started before the
  clean-up, so the brief's folder stays.
- **Build order:** this ADR → Inventory's branch: the dependencies → the
  inventory of callers → the figures before → the shared pieces, server
  then client → the usable rule → a code's figures → the grouped read →
  Where it stands' read → the exports → the seeds → Stock → the item's
  page → Reorder → the riders → the old route removed → the browser
  tests → Help, the rules file and the checks → the figures after → the
  dependencies again → the reviews → the pull request → Movements'
  branch: the dependencies → its inventory → the figures before → the
  indexes → the movement row and its filters → the stock card → the
  seeds → Movements → Inventory's link and the item's movements → the
  browser tests → Help and the checks → the figures after → the
  dependencies again → the reviews → the pull request.

## Amendment (November 2026) — as built (#635)

Inventory's branch, `adr-093-inventory`, built from 15 to 17 November
2026 from its brief in `tmp/adr-093-inventory/`: 119 commits with this
as-built, and two merges of `main`, pull request #635. Movements' branch
adds its own. Where building settled or changed what is above:

### The requirements, each marked

| R | Now |
| --- | --- |
| R1 | Met: one rule for usable stock (44acb455) and one read for a code's figures, `codeFigures` (3c2fad85). Held per code is the least of usable and what confirmed sales still need, equal to the holds' sum on every code of the demo, the small volume and the large (a51bd3b5). A test walks every code against the ledger, and one reads a code alike through by-code, Where it stands and Reorder. Expires first counts usable lots alone |
| R2 | Met (f7417a52, d38e2230, 448c7ac9): a code's places come with their lots in one read, so "2 lots" opens with nothing to read; `?open=` keeps an opened row, and Back puts focus on it |
| R3 | Changed: the five filters with their counts, in the address, each count its rows; the Lot view's four counted by `GET /v1/stock/by-lot/counts` (30a, 31a), and Out there says items that are out have no lots, with Group by Item; the quick filters on a row of their own above the search, in the Filters sheet on a phone (35929c71); "Showing 50 of 128 codes" beside Show 50 more (0d9ea6cd). Back follows #341's rule for every list: a filter replaces the address, so Back leaves Stock and Forward brings it back as it was |
| R4 | Met: a row per lot at each place (25a), a split lot's rows each saying "1 of 2 places"; Home's Expiring soon and the lookup's Show all for a lot open it (d38e2230); its headers sort it (3cc559fe, 54a) |
| R5 | Met: the table no longer drawn (d38e2230), its route and `GET /v1/stock` removed (e29d8a2e) |
| R6 | Met, money in part: the name first, its code grey with its type's word, Code for SKU, a lot's code a link (`LotLink`), every header named, numbers in the page's format (b62ec32b, 3fb4b3e5, 20e78c6c, e8ff30bd, 607ecb90); actions in words, one Actions button on every row (47a). A price in another currency shows its code; the lot's Cost panel does not name the organization's own currency once, as ADR-055's "Money (CAD)" would |
| R7 | Changed in its words (521547f9, 47126196, 1761ce49, c549d0fc, 4b4e9fc6, d57014dd): "Bought · orders what is short" and "in multiples of 12", the brief's, for the decision's "just enough" and "a fixed quantity of 12"; "Buy 2 items on one purchase order" (c6451400), since "Buy 2" read as two units of one thing; the list opens sorted by the suggested order (A5); a new filter clears the ticks, a search keeps them; the draft's link in its own cell stands for the board's Open draft |
| R8 | Changed (17c5035f, 3e810b2a, 4d22afe3, 1c9efb01, 2e0fd268): drawn as v2's board, the five figures as tiles and each lot's Actions; the route declares `stock.view` and gates each part inside (1fedd23f), one server test per permission; a main action the role cannot use reads the app's whom-to-ask line, since the client cannot name the roles that hold a permission; Coming's runs have no day, as a run has no date; a discontinued code with nothing on hand, coming or wanted is not drawn |
| R9 to R13 | Movements' branch. R9's document already shows in the history dialog's Why, linked, until that branch replaces it (64cc349a) |
| R14 | Met for Stock, the Lot view, Reorder and Where it stands: the cut-text test on at 320, 390 and 820 px, at both text sizes and in four languages (553e22d7, 6660d86f, 2e88705e); Movements' part in its branch |
| R15 | Met: the exports in the screen's words through `inWords` (27e97a2b, b195e3b7, 521547f9), at one place that place's figures (06db6e99); the recall list's export (8b3c7b57) |
| R16 | Changed: no sort has an index, since each sorts a worked-out figure or a name in the reader's language, so each is timed instead, and no migration came; Free is no sort (35a); JIT is off (36a); at large the bar is 300 ms (41a). The figures before and after are in ADR-051's as-built |
| R17 | Met for Inventory: every row of Stock's, the item's page's and Reorder's tables a browser test, none left `test.fixme` (4bde0265, 448c7ac9, 2e0fd268, 754bb474, 4b4e9fc6); the canvas's v3 boards for 46a to 52a; the two rows Movements builds, in its branch |
| R18 | Met for Inventory (9b434e1c, c960b966, db0845eb, d4ae53ca): the code changed once is VITC-90 corrected to VITC-100; the order shipped from two lots and movements per shelf, in Movements' branch |
| R19 | Met (6d687f31, 0586d1e7, 452d3a14): the guides and the glossary's words in three languages, `docs/rules/stock.md` and the manual checks; MC-316 and MC-317 left to walk by hand before the merge |
| R20 | Met for Inventory: the pieces first (steps 5 and 6), the consistency test, the promised table deleted, no new copy of 20 lines or more; the screens still to move are #631; the history dialog and the one movement row, in Movements' branch |
| R21 | Movements' branch |
| R22 | Met: the new routes added first; the old four removed and `API_REVISION` raised from 4 to 5, a tab on revision 4 answered 409 `client_outdated` (e29d8a2e) |
| R23 | Met, its count settled by 24a: Items counts items, one test holding it to the distinct items among Reorder's low and out codes, and Home's to Reorder's (17c5035f); "72 not usable" beside the quantity and the badge "Low · 1 of 3 codes" (97f32e50); the filter 143 and 147 ms at large |

### Decided while building

The chat's answers, each by its number:

- **The sorts by a figure (29a, 35a):** each reads only its figure for
  every code, from `codeFigures`' own parts, then the page's 50 in full
  (`sortedFigure`, c960b966). On hand and Expires first stay; Free still
  took 315 to 335 ms at large, past the 240 ms headroom, so `sort=free`
  is a 400 (313dd1c2).
- **A code's figures in a shape a wrong guess cannot slow (34a):** each
  part read once and grouped, stock summed per place before its place is
  joined, the parts unioned and never joined (a51bd3b5), with no planner
  setting.
- **JIT off for the app's connections (36a),** Home accepted under its
  300 ms at large (37a), and 300 ms the bar at large (41a): ADR-051's
  as-built.
- **The volume seed (32a):** one receipt in six put away in two bins;
  about one lot in five expiring within the year after the seed and one
  in a hundred expired already, each chosen by position, so the rest of
  the year is unchanged.
- **What each count counts (24a, 25a, 30a, 31a):** Items counts items,
  Reorder and Home count codes, and the Lot view a lot at each place;
  Help's "What each count counts" says so in three languages.
- **Only the name opens a record (46a):** a click elsewhere on a row or
  a card opens nothing, on Stock, Reorder and Items, their cards and the
  Lot view (7a1c89ae), replacing the decision's "a click elsewhere on the
  row opens the item's page"; the design language's Rows say so.
- **A row's Actions (47a to 50a):** one quiet "Actions" button with its
  small arrow on every row, named for its item or lot, its column's
  header for a screen reader alone. An item's menu in three groups
  (Move…, Ship out…, Send sample…, Correct the count…; Receive stock…;
  Movements, Change reorder point…), a line first where there are
  several lots, "3 lots in 2 places: you choose the lot next", each of
  the first four then opening the row to its lots under "Choose the lot
  to move", focus on the first lot's Actions ("Choose the place" for an
  item not tracked by lot). A lot's menu: Move…, Ship out…, Send
  sample…, Correct the count…; Edit lot details…, Trace lot; Movements.
  A place's row: a plain Movements link. What cannot be done is greyed
  with its reason beneath, `aria-disabled` and still reached by the
  keyboard ("Nothing on hand to move", "Nothing in this lot", "Never
  stocked here: receive it first"); Correct the count stays on at zero,
  opening the emptied places and lots; an action the role cannot use
  stays hidden (741ce6c1, a32719b5, 6f2e03fb, 826b61c4).
- **Receiving what is ordered (51a):** Receive stock, from an item's
  Actions or from the page once such an item is chosen, asks "Which
  delivery is this?", each open order with what is still to come and
  when, and Not on an order; an order opens its line's own Receive
  dialog over Stock, so ordered stock is never received off its order
  and counted twice (f36cb6f6). Only a reader with `orders.view` and
  `orders.receive` is asked, as `GET /v1/orders/deliveries` asks both;
  another receives as before.
- **After a receipt (55a's first half):** "Received 3,000 each of
  BOTTLE-A60 on PO-000009" with Open the order, or "… with no order";
  the history dialog's Why names and links each movement's order or run,
  for a reader who may see it (64cc349a).
- **The Lot view's sorts and the board's look (54a):** the Lot view
  sorts by Expires, its default, and by Item, Location and Quantity, each
  way (3cc559fe); every header that sorts shows it at rest (5509613b);
  the item's page as v2's board draws it (1c9efb01). ADR-057's and
  ADR-090's as-builts.
- **A place written as its path (57a):** "Main warehouse › Zone A ›
  Shelf A2", read for the page's rows alone, never in the counts or a
  sort; cut only where it does not fit, from the left with "…", the
  place's own name whole (c39d1318, a1d98f83).
- **The every-browser run by hand (59a),** since a push to a branch
  starts none.
- **Filed, not built:** a lot's code made at receipt and the rest of
  receiving (52a, #629); a sort by Coming's date (53a, #630); a
  Receiving label beside an order's Status (56a, #605); one 1,600 px
  page frame with table headers that stay (60a to 65b, #632), its own
  pull request before Movements'.

### Built differently from the text above

- **Routes besides the decision's:** `GET /v1/stock/by-lot/counts`
  (30a); `GET /v1/stock/lots/:id/recipients/export`, the recall list;
  `GET /v1/stock/reorder-points/items` (#538); and
  `GET /v1/orders/deliveries` (51a); `GET /v1/stock/movements` gains
  `document` (55a). Each was additive, with `npm run api`.
- **The revision's raise passed the breaking check by itself:** the
  check accepts a path removed under a raised revision, so
  `server/openapi-breaking-accepted.txt` is unchanged.
- **Where it stands is not a `GATED_INSIDE` route:** the whole section
  needs `stock.view`, so the route declares it, and leaves out places,
  orders and runs inside (1fedd23f).
- **A refused shipment's link:** the refusal carries `stock_not_usable`
  with the item, and its words name Where it stands, but no dialog draws
  the link (Deferred, added).
- **Expires first counts usable lots alone,** as the board's row reads.
  Expiring soon, Expired and Waiting for a cost on a code count stock on
  hand alone, with Include empty or without.
- **The opened Reorder row keeps its chevron,** not the opening row:
  #631's.
- **A filter's chip is removed by a click anywhere on it** (#578), as its
  name, "Remove filter: Late", says.
- **`LotLink` offers Back** on the lot's trace, which the links before it
  did not.
- **The recall list has a Date,** the day the lot first left for each
  recipient (`leftOn`), for ADR-044's "with its day"; an order shipped
  twice shows its first.
- **Reorder's ticks:** cleared by a new filter and kept by a search, so
  items found one search at a time still go on one order (d57014dd).
- **#352, #472 and #544 were each taken in part,** where "Fired, and
  taken here" took them whole: #352's typed columns, #472's five
  findings with the rest of its comments in #610, and #544's failed
  page on Items, Stock and Reorder alone. The pull request names each
  Part of (review 67).
- **Chores rode in feature commits** (review 73): the three browser
  tests' own place names in d38e2230, and the volume seed's expiry
  dates in c960b966; and 4bccdabb, meant to change nothing a person
  sees, made Items' grey cards on a phone wait 250 ms.

### Considered and not done, added

- **Receiving off the order and Coming lowered later:** the early design
  would have counted ordered stock twice, on the shelf and as Coming;
  51a replaced it.
- **One shared row-click helper** (review 27): 46a took the click away
  instead.
- **The counts' queries shaped to stay under Postgres's JIT line
  (36b):** fragile, since an estimate grows with the data.

### Measured

- **The figures,** before and after at small and large, are in
  ADR-051's as-built.
- **Time against the brief,** minutes and thousands of tokens from each
  summary's heading:

| Step | Model | Minutes (guess) | Tokens |
| --- | --- | --- | --- |
| 2 | sonnet | 5 (10) | 95 |
| 3 | opus | 14 (15) | 333 |
| 4 | haiku, then sonnet | 11, then 4 (20) | 83, 90 |
| 5 | opus | 27 (30) | 234 |
| 6 | opus | 36 (35) | 399 |
| 7 | opus | 21 (30) | 213 |
| 8 | opus | 20, stopped, then 23 (45) | 230 |
| 9 | opus | 21 (60) | 306 |
| 10 | opus | 22 (45) | 310 |
| 11 | opus | 22 (25) | 257 |
| 12 | sonnet | 20 (20) | 254 |
| 13 | opus | 69, 65 and 31 (135) | 613, 336, 158 |
| 14 | opus | 36 (50) | 400 |
| 15 | opus | 40 (45) | 426 |
| 16 | opus | 37 (35) | 303 |
| 17 | opus | 16 (20) | 255 |
| 18 | opus | 33 (75) | 336 |
| 19 | sonnet | 14 (35) | 278 |
| 20 | sonnet | 23, then 26 (20) | 179, 154 |
| 21 | sonnet | 15 (10) | 139 |
| 22, the findings | opus | 22 (90) | not shown |
| 22, the fixes | opus | about 650 (180) | not shown |

- **Steps 2 to 21 took 629 minutes of 760,** about 83 %. The reviews
  took about 670 of 270, two and a half times: the fixes took in v3's
  boards and five messages of changes from the maintainer (receiving,
  the sort headers, the Lot view's sorts, the item's page, a place's
  path), each its own commit.
- **Opus runs used 158 to 613 thousand tokens,** where Items' used 100
  to 376; Sonnet's 90 to 278.
- **Haiku stopped twice on step 4's wait** for the volume seed, a stop
  the loop does not run again on Opus; Sonnet then ran it in 4 minutes.
  `docs/engineering.md`'s "Which model runs a step" now gives a step
  that waits on a server or a long command to Sonnet.

### The reviews

- **The panel** walked `stock`, `buy` and `trace`, seven walkers at five
  widths: every task finished, nothing blocked, six major findings.
  With `/simplify`, `/code-review`, `/production-readiness` on
  performance and permissions, and `/doctor prompt-audit`: 86 findings.
- **Fixed,** each its own commit naming its number: 1, 3, 12, 16, 24 to
  26, 28 to 30, 32 to 35, 38 to 40, 44, 47 to 57, 59 to 66, 69 to 72,
  74, 78 and 83 to 85; 27 by 46a.
- **Filed:** 2, 5 to 11, 13 to 15, 17 to 23, 37, 42, 43 and 76 as #606
  to #627, 23 being the walkers' smaller findings in one (#623); 36 and
  77 in the `when-touched` issue, #631; 4 as a comment on #534, whose
  question it is. **Deferred:** 58, below.
- **For this as-built:** 67 and 73, above; 68, the decisions written
  here and in ADR-051's and ADR-057's as-builts; 75, the handoff; 79 and
  81, ADR-051's as-built and its Watch. 80 went with 44.
- **Accepted,** each with its reason: 31, `byWarehouse` walks the
  location tree by hand beside `treeOf`, which the readers did not agree
  does the same job; 41, a caller that needs only a status works out
  every figure, about a fifth of the counts, since eased by leaving out
  Expires first for them (db4328fc); 45, a code's full figures read
  `stock_levels` three to five times; 46, Where it stands works out its
  figures twice, 44 ms at large; 86, `brief-step.md`'s 10 to 15 lines
  for the chat, chosen in ADR-089.
- **By hand after the push:** 82, the code scanning alerts on the pull
  request's head, at step 24.
- **Found while fixing:** the code-figures permission test matched
  "590" in the refusal's random ids and time, about one run in a
  hundred, and now reads the refusal's words (58a, 6672519b); help.spec
  met Stock's sort label half past the table's edge beside Help, which a
  browser leaves half cut on focus, fixed for the four tables this
  branch made (646ad661); stock.spec met Show all stock leaving Expired
  on, the box, emptied at once, writing the cleared search 300 ms later
  from the address react-router had yet to show, now one write the box
  follows (3db1aa29). PR CI's burn-in passed #516's 150-test line, and
  timed out at 20 minutes on shard 1 after the retry.

### Deferred, added

- **The refusal's link to Where it stands** in the ship, hand-out,
  release and close dialogs; the server already sends `stock_not_usable`
  with the item (review 58). Trigger: someone refused who cannot tell
  where the expired or issued stock is.
- **Free as a sort,** its figure kept in a column, an ADR of its own
  (35a). Trigger: someone asking to sort by Free, or another sort by a
  figure past 300 ms at large.
- **A run's day in Coming.** Trigger: runs gain a planned day.
- **A sort by Coming's date** (#630) and **what receiving leaves**
  (#629), each with its trigger in its issue.

### For Movements' branch

Read at its brief's first step, so nothing is lost with this branch's
folder:

- 55a's later half: Movements filtered to an order ("Order: PO-…"), and
  the order's page listing its receipts with All movements of PO-…; the
  For column (R9) as v2 drew it.
- #605, a Receiving label beside an order's Status, rides with it, and
  so does #628, counting found stock into a place or lot the item never
  had, its board drawn at the brief's first step (70a); the
  `when-touched` stock issues from these reviews (#609, #611 to #614,
  #616 to #620, #624, #627, #629 and #631) are triaged for which ride
  too.
- Its brief goes to version 6 at its first step, after this branch and
  #632 merge (71a).
- Each place row's Movements link, built on Stock: Movements honours the
  filters it brings.
- A place written as its path on Movements too, by `PlacePath` (57a).
- Its figures through `codeFigures`, under JIT off, timed at large
  against 300 ms (41a).
- Its brief's demo line for a changed code goes: VITC-100 is one.
- #632 merges first, so Movements' boards are drawn at 1920 px in the
  1,600 px frame.

## Amendment (November 2026) — Movements' branch, before building

Planned on 18 and 19 November 2026 on `adr-093-movements`, from `main`
at 0ebaac68, once #635 and #644 had merged (71a). The maintainer
confirmed the requirements below before drafting, and chose every
decision as recommended. The canvas draws them in the rows
"库存与库存变动 第四版 · Inventory and Movements v4", Movements in the
1,600 px frame at 1920 and 1366 (E7), and "第五版 · v5", the stock
card's period line, the export and the order's label. Brief v6
renumbers Movements' steps: M-3 to M-5 keep their numbers, M-6 is 7,
M-7 is 8, M-8 is 10, M-9 is 11, M-10 is 12, M-11 is 17, M-12 is 18
and M-13 is 19.

### Requirements, as confirmed

R9 to R21, their Movements parts, stand. These are added, each naming
its step in brief v6:

| R | What | Done when | Step |
| --- | --- | --- | --- |
| R24 | Movements filtered to a lot or an order, each a chip from its way in; a lot counts In, Out and Balance alone, and with a place too, that lot at that place (85a); an order, of several items, In and Out with no balance | A server test per filter, the lot's balance against the ledger; browser tests from a lot's Actions and from the order's page | 7, 8, 12, 17 |
| R25 | The order's page lists its receipts, with All movements of PO-…; #605's label as it decided (56a, 92a): Not received, Partly received, All received, on a sale shipped, while the order is Confirmed, on Orders' list beside Status and on the page, a filter by it in the address, and "Everything has arrived. Close the order?" at All received | A unit test per case (nothing, part, all, a line closed short, a sale); a browser test receives part, then the rest, and meets the close line; the list's read inside ADR-051's budget at large | 12, 13, 17, 19 |
| R26 | #628: found stock counted into a place or lot the item never had, from a line under Correct the count's places and lots (84a): any leaf place, a lot it has or a new one made with the count; Which lot starts with neither chosen; a new lot waits for a cost, and the message says so (90a) | A server test: a new lot made, a code the item already has refused at its field, a place that is not a leaf refused; a browser test; Help; a manual check | 14, 17, 18 |
| R27 | #636: a list's address write starts from the address as it is when the write runs, so a search's late write never undoes a filter's | A unit test holding the page's update past the search's wait fails before and passes after | 6 |
| R28 | #638: Items, Stock and Reorder always show their count; #473's last line, Back after Show more returning the loaded rows and the place (P2a) | Browser tests with 1, 31 and 312 rows; Back after Show 50 more lands on the row left by, its pages loaded | 15, 17 |
| R29 | A table too wide pins its name column wherever it stands, a column before it passing under it, and with no name column its first (81a); a pinned name at most two lines at a least width of 20em, the whole name in a tooltip on hover and focus that Escape closes (83a, #640); `ListTable` gives `wholeOnFocus` to every list that scrolls sideways, its styles built once (#642); a place's path cut in its middle, the warehouse and the place whole (93a, #639) | `ListTable`'s and `PlacePath`'s unit tests; a browser test beside Help on Movements and on Stock; ADR-090 amended and the design language's lines | 1, 6, 17, 18 |
| R30 | Every export's quantities without padding zeros, quantities only, money keeping its currency's places (77a, 80a), with ADR-057's line | An export test reads `600`, `12.5` and `0.0001` | 9 |
| R31 | Dependencies, each 7 days old the day it is taken; Playwright 1.65.1 only if #521's seven pages pass in the Linux image; typescript-eslint 8.73.0 from 23 November, then both minimatch overrides removed once every copy is 11.0.5 or later, with ADR-019's line | The dependency commits and `npm ls minimatch` in each package; or the pin kept, with a comment on #521 | 2, 20 |
| R32 | #644's panel finding 8: 可用 for Free alone, Free becoming 可分配; one name for the projected figure, Left and 预计剩余, where 剩, 预计可用 and Position stood (94a); a reader of Chinese alone reads Where it stands before the merge | The glossary and the three catalogues agree; a glossary rule in `scripts/i18n-rules.mjs` refuses 预计可用; the reading noted in the pull request | 16, 21 |
| R33 | The riders the triage of 18 November chose: #609, #611, #612, #624, #629 and #631's Movements lines, with #640's other findings; a rider past one commit stops with a comment on its issue | Each closed by its commit, or commented | 16 |
| R34 | The stock card's period line, "Opening · In · Out · Closing", for one item with a date range (88a); with a Reason chosen, no Balance, Opening or Closing, In and Out and their sums kept (91a); the export one value per column, From and To apart, oldest first, its first row the opening balance and its last the closing (87a, 88a) | A server test holds Closing = Opening + In − Out, and Closing equal to today's on hand when the range ends today; the export test reads its columns | 8, 11, 17 |
| R35 | The Performance run of 23 November read; Movements' and Orders' list's figures before and after | ADR-051's as-built names them | 4, 19 |

- **Assumptions:**
  - Movements shows no total under its rows; #638 leaves the lists
    without one.
  - A filter replaces the address, so Back leaves the page (#341's
    rule, as Inventory built it); v2's tables, which gave a filter's
    Back as "every item", are replaced by v4's.
  - No API revision raise: every new field and filter is additive.
  - One migration, step 5's indexes on the from and to place.
- **Not included:** #637, E13 with it; #530 and #643, `fix-now` and
  their own; #613, #614, #616, #617 to #620 and #627, each waiting for
  its screen's own change; the live checks #644 left, which the handoff
  holds.

### Checked before drafting

On 19 November 2026, from `scripts/adr-check.mjs 093` on
`adr-093-movements` at 0ebaac68: the areas `locations`, `orders`,
`products`, `stock`, `api`, `docs`, `help`, `i18n` and `ui`, and the
issues 470, 473, 521, 605, 609, 611, 612, 624, 628, 629, 631, 636, 638
and 640; 148 open issues, 95 read whole. With them, #644's review
(`tmp/adr-093-movements/from-632/review.md`), the Deferred lines of
this ADR and ADR-090, ADR-051's watch and Open decisions.

- **Fired, and taken here:**
  - #605 whole, as its 56a decided (R25, 92a), where 86a had kept it to
    the order's page.
  - #628 (R26, 70a); #636 (R27); #638 with #473's Back after Show more
    (R28, P2a), which is this ADR's own Deferred "Back restoring loaded
    pages" for Items, Stock, Reorder and Movements; #509, the scroll on
    a change of page, stays.
  - #639, a place's path cut at its start (93a), since Movements writes
    every row's places through `PlacePath`; #640 with its comment on a
    pinned name (83a); #642, whose trigger is the next change to
    `list-table.tsx`, which 81a makes.
  - The triage's riders (R33) and #644's finding 8 (R32).
  - #521's check, for Playwright 1.65.1 (R31); ADR-051's watch
    "Movements for one shelf", taken already (9a).
- **Not fired, and left:**
  - The 15 `fix-now` issues in these areas, among them #156, #310,
    #333, #607 and #608: the Fix-ups, and the fix runner's.
  - #641, each line waiting for its screen; #613, #614, #616, #617 to
    #620 and #627, as above; #630, #626, #623 and #615, `later`.
  - #644's panel findings 1 (#637), 4 (#170, #606), 10 (#622, #482)
    and 11 (#610, #566), each with its issue, as ADR-090's amendment
    below records.
  - This ADR's other Deferred lines and ADR-090's: no trigger met; each
    interaction table below stays under 15 rows. Open decisions' Low
    stock and purchase pack entries: no trigger met.
- **Found while checking:**
  - #605's text decided more than the chat's 86a, which was chosen
    without reading it; 92a replaces 86a.
  - #639 asks the opposite of the design language's "cut from the
    left": the part cut away tells two warehouses apart.
  - `ListTable` pins the first column; Movements' first is When, its
    name the second (81a).
  - #629 offers "found in a count" as a reason for a receipt with no
    order; once #628 exists, that choice leads to Correct the count.
  - #640's comment asks whether 16em would do with two lines; 20em
    stands, 16em tried in the branch's walk.
  - That Movements fits at 1366 with Help closed is an estimate, about
    1,000 px in a 1,086 px box; step 3 measures it.
  - Exports already begin with the UTF-8 mark (`server/src/common/csv.ts`),
    so Excel opens Chinese.

### Decided before building

The chat's questions, each answered as recommended:

- **Movements' table (81a, 82a, 83a, 93a):** too wide for its box, the
  item's name stays pinned and When passes under it; with one item, no
  name column, When is pinned. From → to on two lines in one cell, an
  end outside the warehouse in grey words (supplier, customer, run,
  counted in, counted out), each path cut in its middle. A pinned name
  takes at most two lines.
- **The stock card (85a, 87a, 88a, 91a):** a lot chosen counts that lot
  alone; with one item and a date range, "Opening · In · Out · Closing"
  above the table, never for several items, whose units differ; with a
  Reason chosen, no balance; the export oldest first, one value per
  column, Code and Item apart, From and To apart, Lot and Expires apart,
  dates as year-month-day.
- **The orders (92a, 89a):** #605 as decided, its words Not received,
  Partly received and All received (未收货, 部分收货, 已全部收货), on a
  sale Not shipped, Partly shipped and All shipped.
- **Found stock (84a, 90a):** still Correct the count, its reason found,
  a lot made inside the same transaction as its movement; a new lot's
  pool has no average, so it waits for a cost as `valuation.ts` already
  values it, and the message links to Stock value's Waiting for a cost;
  found stock in a lot it has rides at that lot's average.
- **The words (94a):** Free 可分配, the word Chinese warehouse systems
  use for stock that can still be committed, and fitting a raw material
  as 可售 would not; Usable and Not usable keep 现有可用 and 现有不可用;
  the projected figure is Left and 预计剩余 everywhere.

### How it behaves

The boards are v4's and v5's; each row is a browser test.

**Movements:**

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| Movements | Item › Vitamin C | In · Out · Balance replace Change; `?item=` | Movements, one item | leaves Movements (#341) |
| Movements, one item | Place › Shelf A2 | In, Out and Balance count Shelf A2 alone; a move out reads Out | Movements on A2 | leaves Movements |
| Movements, a row | The item's name | — | the item's page, focus on its title | Movements as it was, its pages loaded, focus on the row |
| Movements, a row | A lot or a document | — | the lot's trace, or the order, run or return | Movements as it was |
| Movements, one item | When › a date range | `?from=` and `?to=` in the organization's days; the period line; Opening balance last | the same list | leaves Movements |
| Movements, one item | Reason › Shipped | Balance, Opening and Closing go; In and Out stay, with "Balance counts every reason" and Clear Reason | the same list | leaves Movements |
| Movements | Press When | Oldest first; with one item, the opening balance first | the same list | leaves Movements |
| Movements | Show 25 more | The next 25, focus on the first new row; failing, the rows kept with Try again | a longer list | — |
| Movements, a filter on | Show all movements | Every filter and chip cleared in one address write (#636) | every movement | leaves Movements |
| Movements, too wide | Scroll sideways, or Tab | The name pinned, When under it; a focused link scrolled clear of it | the same list | — |

**Into Movements:**

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| Stock, an item's Actions | Movements | `?item=` | Movements, one item | Stock as it was |
| Stock, a place row | Movements | `?item=&place=` | Movements on that place | Stock as it was, the row open |
| Stock, a lot's Actions | Movements | `?item=&lot=`, a chip | Movements, one lot | Stock as it was, the rows open |
| The item's page, Latest movements | All movements | `?item=` | Movements, one item | the item's page |
| The order's page, Receipts | All movements of PO-000009 | `?order=`, a chip; In and Out, no balance | Movements, one order | the order's page |

**Orders (#605):**

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| Orders | Receiving › Partly received | The list narrows to orders partly received; the filter in the address | Orders, filtered | leaves Orders |
| An order's page, Confirmed | Receive the rest | All received beside Confirmed, with "Everything has arrived. Close the order?" | the same page | — |
| The close line | Close the order | The close dialog, as today | a dialog | Escape: focus back on Close the order |

**Stock, found stock (#628):**

| Where | You do | What happens | You land | Back |
| --- | --- | --- | --- | --- |
| Stock, Correct the count's lots | Count it in… | Correct the count with a place and a lot to choose, neither lot chosen | a dialog | Escape: focus back on Count it in… |
| The dialog | Save correction | A found correction into the place and lot, a new lot made; "Counted in 12 each of VITC-100 at Shelf C3" | Stock, the row open at its new place | — |
| The dialog | Save correction, no lot chosen | "Choose one of its lots, or a new lot." at its field, focus on it | the same dialog | — |

**The five states** differ from the design language's States section
only on Movements: first use, "Nothing has moved yet." with Receive
stock, or the line for a role that cannot; no results naming the
filters on, with Show all movements; the balance hint while more than
one item is listed with a place, a lot or an order chosen; a failed
next 25 kept with Try again (#544).

### Considered and not done, added

- **When alone pinned (81c):** the name scrolls away, and a row read at
  its lot or its document names no item.
- **From and To as two columns on screen (82c):** wider rows at 1366;
  the export has them apart.
- **Found stock received with no order (84c):** it would read Received
  and count as a receipt, with no note asked.
- **The balance kept with a Reason chosen (91b):** its rows would no
  longer add up.
- **可售 for Free:** wrong for a raw material, which is never sold.

### Deferred, added

- **A count by place, a sheet per shelf.** Trigger: counts becoming
  regular, as cycle counts.
- **A second person approving a large correction.** Trigger: an
  auditor, or a paying customer, asking.
- **Found stock in a new lot valued at the item's average across its
  lots.** Trigger: an accountant asking.
- **A total under Movements.** Trigger: someone asking how many moved,
  with its count read inside ADR-051's budgets.

### Consequences

- **Amended:** ADR-090 in this commit (81a, 83a, 93a); ADR-057 for
  exports' quantities (step 9); ADR-019 when the minimatch overrides go
  (step 2 or 20); ADR-051 and this ADR in the as-built (step 22).
- **Docs in their steps:** the design language's Rows and The way back
  (step 18), the glossary with the messages (step 16), the manual
  checks with each change, `docs/rules/stock.md`.
- **Build order:** this amendment and the handoff → the dependencies →
  the inventory → the figures before → the indexes → the shared pieces
  → the movement row → the stock card → exports' quantities → the
  seeds → Movements → the ways in and the order's receipts → #605's
  label → #628 → the counts and Back → the words and the riders → the
  browser tests → Help, the rules file and the docs → the figures after
  → the dependencies again → the reviews → the as-built and the pull
  request.

## Amendment (November 2026) — Movements as built (#655)

Movements' branch, `adr-093-movements`, built on 19 and 20 November
2026 from `main` at 0ebaac68, by its brief, v7 (v6 for steps 1 to 3),
in the ignored `tmp/adr-093-movements/`: 90 commits, then this as-built,
pull request #655. Where building settled or changed the amendment
above:

### The requirements, each marked

| R | Now |
| --- | --- |
| R9 | Met (29e56421, 18a1cec3): When, the item's name first with its code and type in grey, "was VITC-90" under a changed code, the change with its unit, the reason with its detail and note, From → to by path with an outside end in grey words, the lot with its expiry, For linked, By. A transfer says "moved 4" in grey (118a, f5c8ce98); a sample ends "→ sample", For naming its recipient (125, 40821068) |
| R10 | Changed: the filters in the address under the API's keys (95a); the Item field one find box for items, lots and orders (126, 38b26afe, 6d5aa08b); When one menu (review 1, 26a427c7, 0fe31a38). #505's 59, `dayRangeProps`, is used by Movements alone; the four other lists wait (review 47, #649) |
| R11 | Met (df4b8468): Stock's item, place and lot open Movements filtered, Back keeping a place's opened lots; the history dialog gone. A lot's page links to its item and its movements (review 6, 8f16321e) |
| R12 | Met (df4b8468): each code's five newest movements, read by Movements' own `movementPage`, with All movements of the code, which opens on this month (review 1) |
| R13 | Met (bc9d5720, 29e56421): SO-DEMO-5 ships its vitamin D from two lots, each row naming its lot; the seed stops if they go |
| R14 | Met for Movements (18a1cec3, 64b712bc, aabba0d7): cards below 600 px, the filters in one Filters sheet; the cut-text walk at 320, 390 and 820 px holds Movements and a lot's page; a filter chip's words wrap |
| R15 | Met (6e2dd8ed, eb099088, 59bf1c60, e4e5a094, ca6d9855): Movements' export in the screen's words, by the reader's permissions, its columns grown (98a, 114, 116, 138b) |
| R16 | Met (23069893): migration 0082's indexes on the from and to place; Movements for one shelf 68 to 25 ms p95 at large, in the budgets and the plan check; Performance's budgets on the branch passed (run 44874797517). The figures are in ADR-051's as-built |
| R17 | Met (55040a85): every row of Movements' four tables a browser test, but for the rows Built differently below; the canvas's rows v4 to v14 |
| R18 | Met (bc9d5720): the order shipped from two lots; the volume seed already gives a bin about 1,700 movements at small and 3,500 at large, so it is unchanged |
| R19 | Met (a84539f1, then each fix's commit): Help's Movements, Orders, Items, Inventory and Trace a lot guides in three languages, `docs/rules/stock.md`, the manual checks; a wrong line about the recall export's numbers corrected |
| R20 | Met for Movements: one movement row (`movement-view.ts`), one set of cells (`movement-cells.tsx`), the client's `describeMovement` gone (review 24), one `PlaceFilter` (review 28), one list of reason words for the export and the Activity log (`server/src/common/movement-reasons.ts`); the reviews' other copies are filed (#646 to #653) |
| R21 | Met (6e2dd8ed, 18a1cec3): In, Out and Balance worked back from today's on hand, a place counting itself alone; the period line; Closing dated today while the range runs past it (review 11, 89f41c14) |
| R24 | Met (29e56421, 6e2dd8ed, df4b8468, de17fc87): a lot or an order a chip from its way in, a chip for every filter set (review 4); a lot counts alone (85a); an order shows In and Out with no balance; `orderId` refused 403 without `orders.view` |
| R25 | Met (df4b8468, 6a50c9d8, baa3d289, b754d3db, 69c64175): Receipts on a purchase's page, its own read under `orders.view` (102a); the label, its filter `?fulfillment=`, and the close line, which closes at once (103a); every line closed short with nothing in reads Not received (113a). Receiving's rarest filter on ADR-051's Watch (109a) |
| R26 | Met (96549dac, 8d18cbf4): Count it in… under every opened code, named with its code (105a); a place with places inside it refused 409 (104a). Found stock in a lot waiting for a cost is valued at 0 without saying so: filed (112a) |
| R27 | Met (53891574) |
| R28 | Changed (57ef7c01, 1e0ee8d6, c6eda0dd): the count always, Back after Show more, focus on the first new row after Show 25 more (106a); each quick filter's count with its noun (108a, part of #609). The browser tests use 1, 2 and 52 rows, one page and two more, for 1, 31 and 312 |
| R29 | Met (7ef6dace, 537bef6e, 380ed375, 2b7df507, 18a1cec3): 16em tried and 20em kept (review 23) |
| R30 | Met (6cced6a1, 9639c5fa): quantities without padding zeros; money at its currency's places, never fewer and never rounded (99a); the organization's full export as stored |
| R31 | Met as far as the dates allowed (73431f62, c31352ba). Playwright 1.65.1 not taken: it carries 1.65.0's Firefox, and 19 of 159 tests crashed in the Linux image; the pin stays at 1.64.1 and Dependabot skips 1.65.0 and 1.65.1 (139a); #521 commented. typescript-eslint 8.73.0 and the minimatch overrides wait for their own pull request (Deferred, added) |
| R32 | Met (553c85d5): Free 可分配, Left 预计剩余 everywhere, 预计可用 refused by the glossary's rule; read in step 21's panel by its walker who reads only Chinese, a persona, so a fluent person's reading stays with MC-1405 |
| R33 | Met as chosen: #612 and #624 closed by their commits; #631's Movements lines; #611 and #640 in part, #609 in part (108a); #629 commented (119a to 124a) |
| R34 | Changed (6e2dd8ed, 18a1cec3): the period line, and no balance with a Reason chosen, as decided; the export oldest first with an Opening and a Closing line; no opening-balance row in the table, since the period line and the export carry it |
| R35 | Changed: the figures before and after are in ADR-051's as-built; the weekly run of 23 November measures `main`, so the first after the merge is read instead (the handoff) |

### Decided before building, the labels the code cites

Review 64 found these cited in 29 places, held until now only by the
brief:

- **95a, the address keys:** Movements' filters are kept in the address
  under the API's own keys, `variantId`, `locationId`, `lotId`,
  `orderId`, `reason`, `from` and `until`, `until` the last day
  included; `sort` and `order` stay the sort's. They replace the tables'
  `?item=`, `?place=`, `?lot=` and `?order=` above, whose `?order=`
  clashed with the sort's direction.
- **96a, places by permission:** a reader without `locations.view` gets
  no place's name, code or path on Movements, its export, Latest
  movements or a lot's trace, the ids kept, as on Stock, Reorder and
  Where it stands; the page has no From → to, the export no From or To,
  and a line says once a page why (115).
- **97a, a filter the reader may not use:** the page ignores it, as
  Stock does: a place without `locations.view` reads Everywhere, an
  order without `orders.view` lists every movement with no chip; the
  API refuses `orderId` without `orders.view` with 403, before any read.
  No other filter came: By and a partner wait (Deferred, added).

### Decided while building

The chat's answers, each by its number, drawn on the canvas's rows v6
to v14:

- **The export (98a, 99a, 114, 116, 134b, 138b):** the note back as the
  last column, When to the second under "When (Vancouver time)",
  Recorded as where the code changed since, and By's email (98a, 116);
  money at its currency's places (99a); one item's export gains Moved,
  filled on a transfer alone (114); in Chinese the zone's place is ICU's
  short generic name, 时间（温哥华时间）, English and French keeping
  Vancouver (134b); Reason code after Reason, the reason's stable code
  in every language (138b).
- **The reason words (100a, 136a, 141a):** the boards' words, Received,
  Shipped, Moved, Corrected, Made, Used in a run, Sampled and Returned,
  with the detail, on the rows, the filter, the export, the Activity log
  and the glossary; a capital wherever a word stands alone, in French
  too; the Chinese as the glossary has them, 调整 and 生产 among them.
  A code no longer used reads "(discontinued)", the glossary's word for
  an item; the canvas's v14 board drew "Archived" by mistake.
- **Movements' screen (101a, 106a, 115, 118a, 125 to 133b, 135a, 137a):**
  - "Choose one item" only with a place chosen, never with an order
    (101a); focus on the first new row after Show 25 more (106a); a
    transfer's "moved 4" in grey, in neither In nor Out (118a).
  - A reader without places told why once a page, in the permission's
    own words, which also replace Stock's rows of "—" (115); a sample's
    row ending "→ sample", For its recipient by `partners.view` (125).
  - The find box (126): items, lots and orders through the top bar's
    lookup, by the reader's permissions; exact matches alone when there
    are any, close ones under "Close matches" only when none (127a); a
    choice becomes its chip and the box empties (128a). The top bar's
    own close matches, #654 (129a).
  - When one menu: Today, This week, This month, Last 30 days, Last
    month and This year, each with its dates, then Choose dates… and Any
    time (review 1). A range written by `formatRange` in the reader's
    language, Chinese the Chinese way with the year once, 2026年11月1日至20日
    (130b, `client/src/i18n/intl.ts`). Every period ends on the
    organization's today, counted in calendar days, a week from Monday
    for every reader and language (135a, 137a).
  - "All movements of this lot" opens with no dates, the lot's whole
    life (132b); a code no row and no picker names is named by its own
    read, `GET /v1/stock/variants/{id}` under `stock.view` (133b).
  - The When menu, the find box and wrapping chips go into the design
    language (131a), by ADR-090's amendment.
- **Orders (102a, 103a, 109a, 113a):** an order's Receipts for whoever
  may see the order, by `GET /v1/orders/{id}/receipts` (102a); Close
  order at All received closes at once, focus on the title, a question
  before every close being #458's (103a); Receiving's rarest filter
  allowed in the plan check with its reason (109a); every line closed
  short with nothing in, Not received and "Nothing more is expected"
  (113a).
- **Stock (104a, 105a, 107a, 108a, 112a):** a place with places inside
  it refused with 409, as every movement already is (104a); Count it
  in… under every opened code, named with its code (105a); Still needed
  (待发) and Held (已预留) keep their names, Reorder's row opening by "Who
  waits · 2 orders" (107a, #640); a noun with each quick filter's count,
  on Stock, Reorder, Items and Home's tiles (108a, #609); found stock
  valued at 0 in a lot waiting for a cost, filed `fix-now` (112a).
- **#629, the next branch (119a to 124a),** in its comment: lot tracking
  started for a code with stock by a guided step, the stock on hand into
  one lot made for us across every place, its expiry not known and its
  cost moving with it, noted "Stock on hand when lot tracking started"
  (120a, 122a); our own lot codes, their format beside document
  numbering (121a), at most 20 characters so a GS1 barcode carries them
  (123a); a code typed before #629 marked by an Owner as made here, then
  given the supplier's lot (124a).
- **The way of working (110a, 111a, 117, 139a, 140a, 142a, 143a; the
  audit's 60, 63, 66, 69, 70):** the branch measured by dispatching
  Performance (110a); Playwright 1.65.1 tried once of age (111a), not
  taken (R31), Dependabot skipping it (139a); a check refusing a
  person's name in a commit, pull request or issue title, filed for
  later (117); the pictures after showing Stock's Filters sheet as page
  32, since Orders has none (140a); the pull request marked ready after
  this as-built and its Performance run (142a); the Performance median
  job's name filed (143a); `docs/conventions.md` taking 6 November's
  dependency wording (60), "Public text names no one" in `CLAUDE.md`
  (63), "For the chat" keeping its 10 to 15 lines (66, declined), the
  chat's migration reminder naming the volume databases (69), and the
  eval's exception gone (70).

### Built differently from the text above

- **The address keys** are 95a's, not the tables' `?item=`, `?place=`,
  `?lot=`, `?order=`, `?to=`.
- **Not built, so not tested:** an opening-balance row in the table;
  the close dialog with Escape at All received (103a).
- **When is one menu,** not the shared `DateRangeFilter` with its Period.
- **A lot's Usable and Not usable** come from the server, the usable
  rule living there alone (ADR-055), not summed by the page; a lot's
  trace reads it from `usable-stock.ts` (review 27).
- **The API grew, every change adding, the revision still 5:**
  `currentSku` beside `sku`, which keeps the code a movement was
  recorded under; a movement's `change`, `quantityIn`, `quantityOut`,
  `balance` and `recipient`, and a page's `period`; `latestMovements`;
  `needsCost` and the refusal `lot_code_in_use`; an order's
  `fulfillment`, with `?fulfillment=`; the lookup's order `direction`
  and `fulfillment`; a lot's trace's paths, `usable`, `notUsable`,
  `variantId` and `productId`; `allExpired`; Reorder's `waitingOrders`;
  `GET /v1/orders/{id}/receipts` and `GET /v1/stock/variants/{id}`. A
  lot's trace's `locationName`, null for a reader without places, has
  its line in `server/openapi-breaking-accepted.txt`.
- **The time indexes are "desc nulls last",** so Movements orders by
  `created_at desc nulls last, id desc`, and oldest first by `asc nulls
  first`, reading them backward; plain `desc` sorted all of a large
  organization's movements, 83 ms. The page is taken from the ledger
  before its joins (step 5).
- **Back to Stock** focuses the code's name, not the lot's Actions; lots
  opened by "Choose the lot to…" are not kept in `?open=`.
- **A new lot from Count it in…** is saved as a printed code, the dialog
  not asking.
- **The shared Filters button changed every list's phone sheet**
  (review 9), and every filter chip's words now wrap.
- **R28's 1, 31 and 312 rows** are 1, 2 and 52 in the browser tests.

### Measured

- **Migration 0082** took 2.78 s on the large volume, 2.1 million
  movements; each index is 132 or 125 MB there, about 8 times what it
  would be without the id (ADR-051's Watch).
- **Movements at 1366 px** does not fit: a 1,084 px box, 832 with Help
  open, against 1,264 px for every item at its narrowest; the pinned
  name holds it, as 81a planned (#637).
- **The pictures:** 1,320 before at `ca712441`, 1,332 after at
  `c7c7fab6`, 769 changed, each traced to a commit or to the date, 21 by
  anti-aliasing alone. Worth a look, each the branch's side effect: an
  order number breaking at its hyphen on a phone; French "En stock" on
  two lines on a phone; Orders' All alone on a second line at 1440;
  Reorder's names on three or four lines at 1440, Who waits taking the
  room; Movements' expiry chip on three lines at 1440.

### The reviews

- **Step 21's five reviews** found 72: the panel, 8 walkers on `stock`,
  `buy` and `trace` and a Sales walk, no one blocked; `/simplify`,
  `/code-review` and the duplication check; `/production-readiness`;
  the prompt audit. Fixed on the branch: 24 to 33, 13, 1, 2, 3, 4, 6, 9,
  11, 22's S16 and S19, 41, 48 to 52, 54, 55 (the lot trace's older
  joins in #649), 57, and the audit's 60 to 70 but 64 and 66. Filed: #646 to #653. Commented: 14 to 21 on #608, #607,
  #534, #458, #159, #609, #617 and #473; 5 on #170; #649, #521 and #629.
- **Said here:** 7, the pinned Item column taking about 320 px at
  890 px, is #637's; 10, the 14 px line under 32 px figures, stands, as
  the design language sets 14 px for a line that explains a figure; 22's
  other minor and cosmetic findings stay in the panel's merge files; 23,
  20em; 47, `dayRangeProps` on Movements alone; 58, Movements measured
  on GitHub by the dispatched run; 64, this as-built.
- **The full verify** passed twice but for #643's Linux WebKit test,
  which passed 5 of 5 alone.

### Considered and not done, added

- **The text left in the find box after a choice (128b):** the choice
  would show twice, and the next search would start by deleting it.
- **Close matches shown after the exact ones (127):** a whole lot code
  offered other lots.
- **"All movements of this lot" on this month (132a):** it would hide
  the receipt a trace starts from.
- **Periods to their calendar ends (135b):** days still to come, where
  nothing can have moved.
- **Each language's own first day of the week (137b):** two people in
  one organization would see different weeks and exports.
- **Discontinued codes in every picker (133c):** a wider change than
  naming the one chosen.

### Deferred, added

- **Filters by who and by partner (97a).** Trigger: someone asking what
  one person moved, or what went to one customer.
- **The When menu and `dayRangeProps` on Orders, Invoices, Returns and
  Production (review 47).** Trigger: each list's next change (#649).
- **A run's or a return's movements from the find box (126).** Trigger:
  a filter by run, `runId`, with its read.
- **A Sunday week, an organization's setting (137c).** Trigger: a
  customer asking.
- **typescript-eslint 8.73.0 and both minimatch overrides removed
  (R31).** Trigger: their own pull request, from 23 November, with
  ADR-019's line.
- **Every component test on the app's theme (step 6).** Trigger: the
  next change to the theme's colour tokens.

### Consequences

- **Amended with this:** ADR-090, the When menu, the find box and
  wrapping chips (131a); ADR-051, Movements' figures and the Watch.
- **Next:** #629 (119a), its decisions in its comment; the handoff holds
  what is owed after the merge.

## Amendment (November 2026) — lots at receipt (ADR-094)

ADR-094 builds #629, with decisions 119a to 124a of this ADR's review,
and changes three things said above:

- **Count it in…'s new lot** is told by the route, new or made, never
  by the movement's reason (#649's 46), and may take a code made for
  the organization.
- **120a's "split out later with Move or Correct the count"** becomes
  Move to another lot…: Move changes a place, never a lot, and two
  corrections read as lost and found.
- **124a** is a permission of its own, the Owner's alone at first,
  where this ADR's as-built said an Owner and #629's comment an Owner
  or Admin.
