# Stock

What the app allows, refuses and works out for stock, as the code does
it today: usable stock, a code's figures, Inventory's list and Lot view,
a lot's trace, Where it stands, Reorder, what confirmed sales hold and
what may be taken, as ADR-093's Inventory branch completed it. Each
rule links the ADR that decided it, the test that proves it, the Help
section where a person meets it, and the manual check that walks it by
hand. Why a rule is so is in its ADR; how to do a task is in the
[Help guide](../../client/src/help/guides/en/inventory.md). How this
file is kept is in the [README](README.md).

## Usable stock

- **Usable stock is what is at places marked available, less lots
  expired by the organization's today and what released runs were
  issued and have not used.** One rule, read by what confirmed sales
  hold and by Reorder's position alike, so an item's Free and its status
  cannot disagree.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--one-rule-for-usable-stock-and-figures-that-add-up) ·
  [ADR-085](../adr/0085-low-stock.md#decision--low-when-usable-stock-and-what-is-on-its-way-fall-below-the-point) ·
  [test](../../server/test/reservations.e2e-spec.ts) "leaves an expired lot, an issued quantity and a place not available out of Free, each said beside On hand" ·
  [test](../../server/test/reorder-points.e2e-spec.ts) "lists usable stock by location marked available, with what was left out" ·
  [Help](../../client/src/help/guides/en/inventory.md#read-the-stock-stock) ·
  MC-607 · MC-309
- **On hand is every unit at every place, usable or not;** what is not
  usable is said beside it, by why: expired, issued to a run, or at a
  place not available, such as quarantine. Usable and not usable add up
  to on hand.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--one-rule-for-usable-stock-and-figures-that-add-up) ·
  [ADR-042](../adr/0042-samples-and-stock-that-is-not-for-sending.md#decision--unavailable-locations-hold-stock-that-is-not-for-sending) ·
  [test](../../server/test/reservations.e2e-spec.ts) "leaves an expired lot, an issued quantity and a place not available out of Free, each said beside On hand" ·
  [Help](../../client/src/help/guides/en/inventory.md#read-the-stock-stock) ·
  MC-309 · MC-312

## A code's figures

- **Each code's figures are worked out by one read,** so Inventory,
  the item's Where it stands and Reorder cannot disagree: on hand and
  what of it is not usable, why; held; free; short; coming; Left; what
  expires first; and the status.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "gives Inventory’s and Reorder’s routes the same figures for one code" ·
  [Help](../../client/src/help/guides/en/items.md#where-it-stands-stands) ·
  [Help](../../client/src/help/guides/en/inventory.md#read-the-stock-stock) ·
  MC-309 · MC-219
- **The figures add up, for every code:** on hand is the ledger's,
  usable and not usable; held is the least of usable and what confirmed
  sales still want, the sum of every line's hold; free is usable less
  held, never below 0; short is what confirmed sales still want beyond
  what they hold.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--one-rule-for-usable-stock-and-figures-that-add-up) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "walks every code of an organization: on hand is the ledger’s, held the holds’ total, and every sum holds" ·
  [Help](../../client/src/help/guides/en/items.md#where-it-stands-stands) ·
  MC-219
- **Coming is what confirmed purchases still have to receive and what
  released runs still have to make,** its day the soonest a purchase is
  expected; a run has no day. **Left is usable, plus coming, less what
  confirmed sales still want,** Reorder's position.
  [ADR-085](../adr/0085-low-stock.md#decision--low-when-usable-stock-and-what-is-on-its-way-fall-below-the-point) ·
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "works out each figure of a code from the movements recorded, each sum holding" ·
  [Help](../../client/src/help/guides/en/inventory.md#where-an-item-stands-position) ·
  MC-219 · MC-4204
- **What expires first is the usable stock's soonest expiry:** a lot
  already expired, or at a place not available, is not it, and a code
  with no lots has none.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--a-row-per-code-opening-to-its-places-and-lots) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "works out each figure of a code from the movements recorded, each sum holding" ·
  [Help](../../client/src/help/guides/en/inventory.md#read-the-stock-stock) ·
  MC-309 · MC-315

## Inventory's list

- **A row per code lists every code with stock on hand, wanted by a
  confirmed sale, coming, or watched by a reorder point,** so Out lists
  a code at 0; Include empty lists the rest. At one place chosen, what is
  there, its On hand and Expires first there, Free and Held the whole
  item's.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "lists a row per code with its figures, and Include empty the rest" ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "keeps what is at one place, its figures there, Free and Held the whole item’s" ·
  [Help](../../client/src/help/guides/en/inventory.md#read-the-stock-stock) ·
  MC-301
- **A lot's code searched with a place chosen finds that lot at that
  place alone,** never a code whose matching lot is held elsewhere.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "finds a lot by its code at the place chosen alone, never one held elsewhere" ·
  [Help](../../client/src/help/guides/en/inventory.md#find-stock-find) ·
  MC-314
- **Sorted by On hand or Expires first, each page follows the figure
  its rows show, either way,** a code with nothing to expire last both
  ways; at one place chosen, On hand and Expires first are what is
  there. Free is not a sort: worked out for every code it took 335 ms
  at the large volume, past ADR-051's 240 ms headroom (35a), and the
  route refuses it.
  [ADR-057, amended](../adr/0057-lists-by-date-range-sorted-where-it-helps-exported-as-csv.md#amendment-november-2026--inventorys-and-movements-sorts-adr-093) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "reads each figure sort’s pages in the order of the figures they show, either way" ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "sorts by name, On hand and Expires first, and pages without skipping or repeating" ·
  [Help](../../client/src/help/guides/en/inventory.md#find-stock-find) ·
  MC-315
- **Each quick filter's count is the rows it shows,** with the other
  filters on and its own off: Low stock holds the out, and Expiring soon
  the expired, as Home's tiles do.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "counts each quick filter as the rows it shows, with the other filters on" ·
  [Help](../../client/src/help/guides/en/inventory.md#what-each-count-counts-counts) ·
  MC-1528 · MC-311
- **The Lot view is a row per lot at each place, soonest first, the
  expired on top,** a lot's places together, each saying how many there
  are: the rows Home's Expiring soon counts.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [ADR-091, amended](../adr/0091-home-redesigned.md#amendment-november-2026--the-tiles-lists-after-inventorys-redesign-adr-093) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "lists a row per lot at each place, soonest first, the expired on top, a lot’s places together" ·
  [test](../../server/test/home.e2e-spec.ts) "opens, from each tile, as many rows as it counts, the late among them" ·
  [Help](../../client/src/help/guides/en/inventory.md#group-by-lot-lots) ·
  MC-313 · MC-311
- **The Lot view's counts are its rows, lots at each place, never
  codes:** Low stock, Expiring soon, Expired and Waiting for a cost, each
  with the other filters on and its own off; no Out, since a code that
  is out keeps no lot. Its export is the same rows.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "counts each of the Lot view’s quick filters as the lots it shows, with the other filters on, and exports those rows" ·
  [Help](../../client/src/help/guides/en/inventory.md#what-each-count-counts-counts) ·
  MC-313
- **A place's name goes only to a reader who may see places;** the rest
  read the lots and their figures without it.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "opens a code to its places and their lots, soonest first, a place’s name only for a reader who may see places" ·
  [Help](../../client/src/help/guides/en/inventory.md#read-the-stock-stock) ·
  MC-312
- **An export is the rows its list shows, with its filters, in the
  screen's words and the reader's language:** a status as Low, Out or
  Enough, a unit as "each", never a stored code; quantities and days
  stay data.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--how-it-behaves) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "exports the rows the screen lists, with its filters, in the screen’s words and the reader’s language" ·
  [Help](../../client/src/help/guides/en/inventory.md#find-stock-find) ·
  MC-317
- **Receiving an item still to come on a confirmed purchase asks which
  delivery it is first,** each order with what is still to come and when,
  and Not on an order; an order is received on its own line, so the order
  closes and Coming falls, never off it beside the order. The deliveries
  are Coming's purchases line by line (`GET /v1/orders/deliveries`, for
  whoever may see orders and receive on them); a reader without both
  receives as before.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--how-it-behaves) ·
  [test](../../server/test/deliveries.e2e-spec.ts) "lists each confirmed purchase still to come, the day expected first, and receiving on it lowers Coming" ·
  [test](../../server/test/deliveries.e2e-spec.ts) "lists none of another organization’s, and asks orders.view and orders.receive" ·
  [test](../../client/src/inventory/inventory-page.test.tsx) "asks which delivery it is from the page’s Receive stock, once such an item is chosen" ·
  [Help](../../client/src/help/guides/en/inventory.md#receive-stock-receive) ·
  MC-310

## A lot's trace

- **A lot's recall list is everyone who received it or anything made
  from it,** each with how much was shipped, sampled and returned and
  the day it first left; its export is the same rows, in the reader's
  language, for a reader with stock.view.
  [ADR-044, amended](../adr/0044-lot-trace.md#amendment-november-2026--the-recall-lists-export-and-a-lots-expired-days-adr-093) ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "follows an ingredient through the batch to everyone who received it" ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "exports the recall list as Who received it lists it, in the reader’s words" ·
  [Help](../../client/src/help/guides/en/lots.md#read-a-trace-read) ·
  MC-906

## Where it stands

- **Where it stands lists an item's codes, the out first, then the low,
  each with its figures from the one read and the lines behind them:**
  Held's confirmed sales, the earliest confirmed first, each with what it
  wants, holds and is short; Coming's purchases, the sooner first, and
  its runs; and each place with its lots, soonest first. The lines add
  up to the figures.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "stands an item’s codes the low first, each figure with the lines behind it" ·
  [test](../../server/test/code-figures.e2e-spec.ts) "gives Inventory’s and Reorder’s routes the same figures for one code" ·
  [Help](../../client/src/help/guides/en/items.md#where-it-stands-stands) ·
  MC-219
- **Buy or Make on Where it stands orders what Reorder suggests for the
  code:** bought or made as its reorder point says, the quantity
  Reorder's own row reads; none for a code with no point, and 0 when it
  is not low or a draft covers it already.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [ADR-085](../adr/0085-low-stock.md#decision--a-reorder-point-per-item-bought-or-made-with-a-rule-for-how-much) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "stands an item’s codes the low first, each figure with the lines behind it" ·
  [Help](../../client/src/help/guides/en/items.md#where-it-stands-stands) ·
  MC-219
- **Where it stands is sent only to a reader with stock.view,** and the
  others are refused in their own words, naming whom to ask.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "sends Where it stands only to a reader with stock.view, refused in their words" ·
  [Help](../../client/src/help/guides/en/items.md#where-it-stands-stands) ·
  MC-220
- **Each part beyond the figures goes only to a reader who may see it,
  the number kept:** places by name with locations.view, else the usable
  lots alone, adding up to usable, the not usable one line; Held's sales
  and Coming's purchases with orders.view, else how many orders wait;
  Coming's runs with production.view.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "leaves out places without locations.view: the usable lots alone, adding up to usable" ·
  [test](../../server/test/code-figures.e2e-spec.ts) "leaves out the sales and purchases without orders.view, the number of orders kept" ·
  [test](../../server/test/code-figures.e2e-spec.ts) "leaves out the runs without production.view" ·
  [test](../../client/src/products/where-it-stands.test.tsx) "names whom to ask for Buy, and lists the usable lots without places" ·
  [Help](../../client/src/help/guides/en/items.md#where-it-stands-stands) ·
  MC-219 · MC-220
- **Items counts items, Reorder and Home count codes:** Items' Low stock
  is the items among Reorder's low and out codes, and Home's Low stock is
  Reorder's count.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--items-stock-from-the-same-count-21a) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "counts Low stock as items on Items and as codes on Reorder and Home, one number each" ·
  [Help](../../client/src/help/guides/en/inventory.md#what-each-count-counts-counts) ·
  [Help](../../client/src/help/guides/en/items.md#what-a-row-shows-rows) ·
  MC-218 · MC-316

## Reorder

- **Reorder lists every code with a reorder point, the low first,** the
  furthest below its point as a share of it first, then the rest by
  code; sorted by the suggested order when asked, most first unless
  asked otherwise, the list's own order breaking its ties, page after
  page. The screen asks for the suggested order, most first, unless
  Status, Low first, is chosen. Its export is the same rows, in that order, its status, Bought
  or made, How much to order and unit in the screen's words in the
  reader's language.
  [ADR-085](../adr/0085-low-stock.md#decision--a-reorder-point-per-item-bought-or-made-with-a-rule-for-how-much) ·
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--reorder-buying-and-making-what-is-short) ·
  [test](../../server/test/reorder-points.e2e-spec.ts) "puts the low first, the furthest below its point as a share of it first, then the rest by code" ·
  [test](../../server/test/reorder-points.e2e-spec.ts) "sorts by the suggested order, most first unless asked, the list’s own order breaking ties, page after page" ·
  [test](../../server/test/reorder-points.e2e-spec.ts) "writes the list as CSV, filtered as asked, with headers in the reader’s language, and records it" ·
  [test](../../client/src/inventory/reorder-points-tab.test.tsx) "opens sorted by the suggested order, most first; its header turns it, and Status puts Low first" ·
  [Help](../../client/src/help/guides/en/inventory.md#order-or-make-what-is-low-order) ·
  MC-4202 · MC-4203
- **An opened row names its places only to a reader who may see
  places;** the rest read its usable as one total, with what was left
  out as expired or issued in all.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/reorder-points.e2e-spec.ts) "names no place to a reader without locations.view: the row’s usable stands alone" ·
  [Help](../../client/src/help/guides/en/inventory.md#where-an-item-stands-position) ·
  MC-4204

## What confirmed sales hold

- **A confirmed sale holds usable stock, the earliest confirmed first;
  the last goes short.** Each line holds what is left after every
  earlier-confirmed line, up to what it still needs to ship; what it
  needs beyond that is backordered. Holds are worked out on every read,
  never stored.
  [ADR-045](../adr/0045-reservations.md#decision--first-confirmed-first-held) ·
  [ADR-045, amended](../adr/0045-reservations.md#amendment-november-2026--free-from-usable-stock-adr-093) ·
  [test](../../server/test/reservations.e2e-spec.ts) "holds for the earliest confirmed first, and backorders the rest" ·
  [test](../../server/test/reservations.e2e-spec.ts) "holds for the earliest confirmed first from usable stock, and the last goes short" ·
  [Help](../../client/src/help/guides/en/inventory.md#words-youll-meet-words) ·
  MC-607
- **Free is usable less held, never below 0.**
  [ADR-045, amended](../adr/0045-reservations.md#amendment-november-2026--free-from-usable-stock-adr-093) ·
  [test](../../server/test/reservations.e2e-spec.ts) "leaves an expired lot, an issued quantity and a place not available out of Free, each said beside On hand" ·
  [Help](../../client/src/help/guides/en/inventory.md#words-youll-meet-words) ·
  MC-607
- **Stock at a place not available holds nothing.** Moving held stock
  into quarantine leaves the orders after it short.
  [ADR-042](../adr/0042-samples-and-stock-that-is-not-for-sending.md#decision--unavailable-locations-hold-stock-that-is-not-for-sending) ·
  [test](../../server/test/reservations.e2e-spec.ts) "does not count stock at an unavailable location" ·
  [Help](../../client/src/help/guides/en/inventory.md#words-youll-meet-words) ·
  MC-312
- **Confirming a sale never refuses for lack of stock:** the line holds
  what there is, and the rest is backordered.
  [ADR-045](../adr/0045-reservations.md#decision--confirm-anyway-when-short) ·
  [test](../../server/test/reservations.e2e-spec.ts) "confirms an order there is no stock for" ·
  [Help](../../client/src/help/guides/en/inventory.md#words-youll-meet-words) ·
  MC-607
- **A hold ends when its line ships, is closed short, or its order is
  cancelled,** and the orders after it hold what it leaves.
  [ADR-045](../adr/0045-reservations.md#decision--computed-never-stored) ·
  [test](../../server/test/reservations.e2e-spec.ts) "releases a hold when its order is cancelled" ·
  [test](../../server/test/reservations.e2e-spec.ts) "frees stock for others once an order ships"

## Taking stock

- **A sale's shipment may take its own hold and the usable stock nobody
  holds, never another order's hold.**
  [ADR-045](../adr/0045-reservations.md#decision--enforced-where-stock-leaves-or-is-committed) ·
  [test](../../server/test/reservations.e2e-spec.ts) "lets an order ship its own hold, but not another order" ·
  [Help](../../client/src/help/guides/en/inventory.md#if-something-is-refused-refused) ·
  MC-609
- **A hand-out, a one-off shipment, a run's release and its top-up at
  close take only usable stock nobody holds.**
  [ADR-045](../adr/0045-reservations.md#decision--enforced-where-stock-leaves-or-is-committed) ·
  [test](../../server/test/reservations.e2e-spec.ts) "refuses a sample or one-off shipment of held stock" ·
  [test](../../server/test/production-orders.e2e-spec.ts) "refuses a top-up of stock a confirmed sale holds" ·
  partly tested ·
  [Help](../../client/src/help/guides/en/inventory.md#if-something-is-refused-refused) ·
  MC-609
- **Taking stock that is expired or issued to a run, when another order
  needs the usable, is refused,** saying how many are expired or issued,
  and with the item, whose Where it stands shows which (the code
  `stock_not_usable`). Expired and issued stock is on the shelf, but
  holds nothing for anyone.
  [ADR-045, amended](../adr/0045-reservations.md#amendment-november-2026--free-from-usable-stock-adr-093) ·
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--one-rule-for-usable-stock-and-figures-that-add-up) ·
  [test](../../server/test/reservations.e2e-spec.ts) "refuses a shipment that would take expired stock another order needs, saying how many, with the item" ·
  [test](../../server/test/reservations.e2e-spec.ts) "refuses a shipment that would take stock issued to a run another order needs" ·
  [Help](../../client/src/help/guides/en/inventory.md#if-something-is-refused-refused) ·
  MC-609
- **With nothing held for anyone else, holds refuse nothing:** a place
  short of stock is the stock check's refusal, naming the place, and
  which lot a shipment takes is earliest expiry first, expired lots
  included, until #333's picking half.
  [ADR-045](../adr/0045-reservations.md#decision--enforced-where-stock-leaves-or-is-committed) ·
  [ADR-093](../adr/0093-inventory-and-movements.md#deferred--each-with-what-brings-it-in) ·
  no test
- **Transfers and corrections are never refused for holds:** they
  record what happened on the shelf.
  [ADR-045](../adr/0045-reservations.md#decision--enforced-where-stock-leaves-or-is-committed) ·
  [test](../../server/test/reservations.e2e-spec.ts) "still allows transfers and corrections of held stock" ·
  [Help](../../client/src/help/guides/en/inventory.md#move-ship-or-correct-move) ·
  MC-302
- **A refusal for holds is in the reader's language,** and says whose
  hold it is: other orders' for a shipment, confirmed orders' for
  anything else.
  [ADR-054](../adr/0054-languages.md) ·
  [test](../../server/test/reservations.e2e-spec.ts) "says who holds the stock in the reader’s language" ·
  MC-609
