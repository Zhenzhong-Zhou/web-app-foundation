# Stock

What the app allows, refuses and works out for stock, as the code does
it today: begun with usable stock, what confirmed sales hold and what may
be taken, and grown as ADR-093's Inventory branch adds its rules. Each
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
  MC-607
- **On hand is every unit at every place, usable or not;** what is not
  usable is said beside it, by why: expired, issued to a run, or at a
  place not available, such as quarantine. Usable and not usable add up
  to on hand.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--one-rule-for-usable-stock-and-figures-that-add-up) ·
  [ADR-042](../adr/0042-samples-and-stock-that-is-not-for-sending.md#decision--unavailable-locations-hold-stock-that-is-not-for-sending) ·
  [test](../../server/test/reservations.e2e-spec.ts) "leaves an expired lot, an issued quantity and a place not available out of Free, each said beside On hand"

## A code's figures

- **Each code's figures are worked out by one read,** so Inventory,
  the item's Where it stands and Reorder cannot disagree: on hand and
  what of it is not usable, why; held; free; short; coming; Left; what
  expires first; and the status.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "gives Inventory’s and Reorder’s routes the same figures for one code" ·
  partly tested
- **The figures add up, for every code:** on hand is the ledger's,
  usable and not usable; free is usable less held, never below 0; short
  is what confirmed sales still want beyond what they hold.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--one-rule-for-usable-stock-and-figures-that-add-up) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "walks every code of an organization: on hand is the ledger’s, and every sum holds"
- **Coming is what confirmed purchases still have to receive and what
  released runs still have to make,** its day the soonest a purchase is
  expected; a run has no day. **Left is usable, plus coming, less what
  confirmed sales still want,** Reorder's position.
  [ADR-085](../adr/0085-low-stock.md#decision--low-when-usable-stock-and-what-is-on-its-way-fall-below-the-point) ·
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "works out each figure of a code from the movements recorded, each sum holding"
- **What expires first is the usable stock's soonest expiry:** a lot
  already expired, or at a place not available, is not it, and a code
  with no lots has none.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--a-row-per-code-opening-to-its-places-and-lots) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "works out each figure of a code from the movements recorded, each sum holding"

## Inventory's list

- **A row per code lists every code with stock on hand, wanted by a
  confirmed sale, coming, or watched by a reorder point,** so Out lists
  a code at 0; Include empty lists the rest. At one place chosen, what is
  there, its On hand and Expires first there, Free and Held the whole
  item's.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "lists a row per code with its figures, and Include empty the rest" ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "keeps what is at one place, its figures there, Free and Held the whole item’s"
- **Sorted by On hand, Free or Expires first, each page follows the
  figure its rows show, either way,** a code with nothing to expire last
  both ways; at one place chosen, On hand and Expires first are what is
  there.
  [ADR-057, amended](../adr/0057-lists-by-date-range-sorted-where-it-helps-exported-as-csv.md#amendment-november-2026--inventorys-and-movements-sorts-adr-093) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "reads each figure sort’s pages in the order of the figures they show, either way"
- **Each quick filter's count is the rows it shows,** with the other
  filters on and its own off: Low stock holds the out, and Expiring soon
  the expired, as Home's tiles do.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "counts each quick filter as the rows it shows, with the other filters on"
- **The Lot view is a row per lot at each place, soonest first, the
  expired on top,** a lot's places together, each saying how many there
  are: the rows Home's Expiring soon counts.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [ADR-091, amended](../adr/0091-home-redesigned.md#amendment-november-2026--the-tiles-lists-after-inventorys-redesign-adr-093) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "lists a row per lot at each place, soonest first, the expired on top, a lot’s places together" ·
  [test](../../server/test/home.e2e-spec.ts) "opens, from each tile, as many rows as it counts, the late among them"
- **The Lot view's counts are its rows, lots at each place, never
  codes:** Low stock, Expiring soon, Expired and Waiting for a cost, each
  with the other filters on and its own off; no Out, since a code that
  is out keeps no lot. Its export is the same rows.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "counts each of the Lot view’s quick filters as the lots it shows, with the other filters on, and exports those rows"
- **A place's name goes only to a reader who may see places;** the rest
  read the lots and their figures without it.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "opens a code to its places and their lots, soonest first, a place’s name only for a reader who may see places"
- **An export is the rows its list shows, with its filters, in the
  screen's words and the reader's language:** a status as Low, Out or
  Enough, a unit as "each", never a stored code; quantities and days
  stay data.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--how-it-behaves) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "exports the rows the screen lists, with its filters, in the screen’s words and the reader’s language"

## A lot's trace

- **A lot's recall list is everyone who received it or anything made
  from it,** each with how much was shipped, sampled and returned and
  the day it first left; its export is the same rows, in the reader's
  language, for a reader with stock.view.
  [ADR-044, amended](../adr/0044-lot-trace.md#amendment-november-2026--the-recall-lists-export-and-a-lots-expired-days-adr-093) ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "follows an ingredient through the batch to everyone who received it" ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "exports the recall list as Who received it lists it, in the reader’s words"

## Where it stands

- **Where it stands lists an item's codes, the out first, then the low,
  each with its figures from the one read and the lines behind them:**
  Held's confirmed sales, the earliest confirmed first, each with what it
  wants, holds and is short; Coming's purchases, the sooner first, and
  its runs; and each place with its lots, soonest first. The lines add
  up to the figures.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "stands an item’s codes the low first, each figure with the lines behind it" ·
  [test](../../server/test/code-figures.e2e-spec.ts) "gives Inventory’s and Reorder’s routes the same figures for one code"
- **Where it stands is sent only to a reader with stock.view,** and the
  others are refused in their own words, naming whom to ask.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "sends Where it stands only to a reader with stock.view, refused in their words"
- **Each part beyond the figures goes only to a reader who may see it,
  the number kept:** places by name with locations.view, else the usable
  lots alone, adding up to usable, the not usable one line; Held's sales
  and Coming's purchases with orders.view, else how many orders wait;
  Coming's runs with production.view.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "leaves out places without locations.view: the usable lots alone, adding up to usable" ·
  [test](../../server/test/code-figures.e2e-spec.ts) "leaves out the sales and purchases without orders.view, the number of orders kept" ·
  [test](../../server/test/code-figures.e2e-spec.ts) "leaves out the runs without production.view"
- **Items counts items, Reorder and Home count codes:** Items' Low stock
  is the items among Reorder's low and out codes, and Home's Low stock is
  Reorder's count.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--items-stock-from-the-same-count-21a) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "counts Low stock as items on Items and as codes on Reorder and Home, one number each"

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
  MC-607
- **Free is usable less held, never below 0.**
  [ADR-045, amended](../adr/0045-reservations.md#amendment-november-2026--free-from-usable-stock-adr-093) ·
  [test](../../server/test/reservations.e2e-spec.ts) "leaves an expired lot, an issued quantity and a place not available out of Free, each said beside On hand" ·
  MC-607
- **Stock at a place not available holds nothing.** Moving held stock
  into quarantine leaves the orders after it short.
  [ADR-042](../adr/0042-samples-and-stock-that-is-not-for-sending.md#decision--unavailable-locations-hold-stock-that-is-not-for-sending) ·
  [test](../../server/test/reservations.e2e-spec.ts) "does not count stock at an unavailable location"
- **Confirming a sale never refuses for lack of stock:** the line holds
  what there is, and the rest is backordered.
  [ADR-045](../adr/0045-reservations.md#decision--confirm-anyway-when-short) ·
  [test](../../server/test/reservations.e2e-spec.ts) "confirms an order there is no stock for" ·
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
  [test](../../server/test/reservations.e2e-spec.ts) "still allows transfers and corrections of held stock"
- **A refusal for holds is in the reader's language,** and says whose
  hold it is: other orders' for a shipment, confirmed orders' for
  anything else.
  [ADR-054](../adr/0054-languages.md) ·
  [test](../../server/test/reservations.e2e-spec.ts) "says who holds the stock in the reader’s language"
