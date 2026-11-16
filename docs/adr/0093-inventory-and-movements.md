---
status: accepted
date: 2026-11-14
areas: [products, stock, ui]
amends: [ADR-044, ADR-045, ADR-051, ADR-057, ADR-085, ADR-090, ADR-091, ADR-092]
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
