# Stock

What the app allows, refuses and works out for stock, as the code does
it today: usable stock, a code's figures, Inventory's list and Lot view,
Movements, a lot's trace, Where it stands, Reorder, what confirmed sales
hold, what may be taken and stock found where it never was, as ADR-093's
Inventory branch completed it
and its Movements branch grows it. Each
rule links the ADR that decided it, the test that proves it, the Help
section where a person meets it, and the manual check that walks it by
hand. Why a rule is so is in its ADR; how to do a task is in the
[Help guide](../../client/src/help/guides/en/inventory.md). How this
file is kept is in the [README](README.md).

## Usable stock

- **Usable stock is what is at places marked available, less lots
  expired by the organization's today and what released runs were
  issued and have not used.** One rule, read by what confirmed sales
  hold and by Reorder's Left alike, so an item's Free and its status
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
  confirmed sales still want,** one name wherever it shows, Reorder's
  once Position (94a).
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
  the expired, as Home's tiles do. Beside Show 50 more, "Showing 50 of
  128 codes" (lots on the Lot view) counts the rows the list shows, every
  filter on, from the same statement; once every row is shown, the list
  says how many, "31 codes", as Reorder does.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "counts each quick filter as the rows it shows, with the other filters on" ·
  [test](../../client/src/inventory/inventory-page.test.tsx) "says how many codes it shows once every one is shown" ·
  [Help](../../client/src/help/guides/en/inventory.md#what-each-count-counts-counts) ·
  [test](../../client/e2e/stock.spec.ts) "Stock, its count always: “2 codes” when everything fits; Low stock, “1 code”" ·
  MC-1528 · MC-311 · MC-323
- **Back to Stock returns it as it was:** the rows shown after Show 50
  more are read again, page by page, before they show; the codes opened,
  with the places and lots opened in them, stay open in the address; and
  focus returns to the row the person left from. A page failing on the
  way keeps the pages before it, with Try again.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../client/src/inventory/inventory-page.test.tsx) "finds the codes shown and the one left from on Back after Show 50 more" ·
  [test](../../client/src/inventory/inventory-page.test.tsx) "gives a lot its Movements, and Back finds its place’s lots open" ·
  [test](../../client/src/lib/use-keyset-list.test.ts) "reads as many rows again as were shown, before they show" ·
  [test](../../client/e2e/stock.spec.ts) "Stock, Back after Show 50 more: the codes shown read again, focus on the row left from" ·
  [test](../../client/e2e/stock.spec.ts) "Stock, a lot’s Actions › Movements: Movements, one lot, a chip; Back, Stock as it was, the rows open and the place’s lots with them" ·
  [Help](../../client/src/help/guides/en/inventory.md#read-the-stock-stock) ·
  MC-323
- **The Lot view is a row per lot at each place, soonest first, the
  expired on top,** a lot's places together, each saying how many there
  are: the rows Home's Expiring soon counts. Its headers sort it by the
  item, the place or the quantity instead, or Expires the other way,
  each paged without skipping or repeating, a lot with no expiry last
  either way.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [ADR-091, amended](../adr/0091-home-redesigned.md#amendment-november-2026--the-tiles-lists-after-inventorys-redesign-adr-093) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "lists a row per lot at each place, soonest first, the expired on top, a lot’s places together" ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "sorts the Lot view by Expires, the item, the place or the quantity, either way, and pages without skipping or repeating" ·
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
  read the lots and their figures without it. Stock and Where it stands
  write it as its path, the places above it by name, its warehouse
  first, read for the page's rows alone (57a).
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--where-it-stands-on-the-items-page) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "opens a code to its places and their lots, soonest first, a place’s name only for a reader who may see places" ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "sends the places above each place, its warehouse first, on Stock and Where it stands" ·
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
- **Stock value's export writes each unit cost and value at the base
  currency's places, never fewer and never rounded:** a value stored
  `20.000000` as `20.00`, a unit cost of `0.012345` as it is.
  [ADR-057, amended](../adr/0057-lists-by-date-range-sorted-where-it-helps-exported-as-csv.md#amendment-november-2026--inventorys-and-movements-sorts-adr-093) ·
  [test](../../server/test/costs.e2e-spec.ts) "leaves equipment out of stock value and of what waits for a cost, though Inventory holds it" ·
  [test](../../server/src/common/export.spec.ts) "drops the padding zeros of a quantity, and money’s down to its currency’s places" ·
  MC-1558
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

## Movements

- **Movements list newest first by when each was recorded, then by
  id,** or oldest first when asked, each page following on with no gap
  and no repeat; movements recorded together, as a shipment from two
  lots, keep one order on every page.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--movements-a-log-filtered-in-the-address-a-stock-card-for-one-code) ·
  [test](../../server/test/movements.e2e-spec.ts) "lists newest first by when each was recorded, then by id, and pages without repeating or skipping a row" ·
  [test](../../server/test/movements.e2e-spec.ts) "lists one order’s two movements of one quantity from two lots, each with its own lot, in one order on every page" ·
  [test](../../server/test/movements.e2e-spec.ts) "works each row’s balance back from today’s on hand, across every place and at one, the same on every page and either way" ·
  MC-306
- **Movements' filters are in the address, each by its id,** never a
  code, which can change: the item, place, lot and order, the reason,
  and the days from and until, `until` the last day included, in the
  organization's days. A reload, a link and Back keep them; a lot and an
  order show as chips, each removable; Show all movements clears every
  one in a single write and keeps the sort.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../client/src/inventory/movements-page.test.tsx) "asks the list by the address’s keys, the lot and the order as chips" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "clears every filter and chip in one write with Show all movements, the sort kept" ·
  [test](../../client/e2e/movements-page.spec.ts) "Movements, every filter in the address: a reload keeps each, and the rows" ·
  [test](../../client/e2e/movements-page.spec.ts) "Movements, a filter on, Show all movements: every filter and chip cleared in one address write; Back leaves Movements" ·
  [Help](../../client/src/help/guides/en/movements.md#find-a-movement-find) ·
  MC-320
- **A movement is one row on every screen that lists one:** the item's
  name with today's code and type, "was" the code it was recorded under
  where that differs, the change with its unit, the reason, the lot with
  its expiry, the document it was for and who did it, the same cells on
  Movements, the item's Latest movements and an order's Receipts. The
  reason reads in the same words in the row, the Reason filter and the
  export: Received, Shipped, Moved, Corrected, Made, Used in a run,
  Sampled and Returned, a correction's detail after a colon, "Corrected:
  found".
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "lists each movement as one row: today’s code and the one it was recorded under, the lot, each place by its path" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "names the item first, its code and type grey under it, and reads the change with its unit" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "keeps a changed code’s old one under today’s" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "says a reason in the boards’ words, a correction’s detail after it" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "offers each reason in the boards’ words" ·
  [test](../../server/test/movements.e2e-spec.ts) "exports each reason in the screen’s words with its detail, and an end outside the warehouse in words" ·
  [Help](../../client/src/help/guides/en/movements.md#find-a-movement-find) ·
  MC-320
- **Show 25 more adds the next movements below, and failing keeps the
  rows, with Try again;** Back from a row past the first page reads those
  pages again before they show, its row in focus.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../client/src/inventory/movements-page.test.tsx) "finds the rows shown and the link left by on Back after Show 25 more" ·
  [test](../../client/e2e/movements-page.spec.ts) "Movements, Show 25 more: the next movements below; failing, the rows kept with Try again; Back from a row past the first page, those pages read again, focus on its row" ·
  [Help](../../client/src/help/guides/en/movements.md#find-a-movement-find) ·
  MC-323
- **One code reads as a stock card: In, Out and the balance after each
  movement.** Across every place, what arrived is In and what left is
  Out, and a move between two of its places is neither, so the balance
  holds; with a place chosen, that place alone, a move out of it Out;
  with a lot chosen, that lot alone, and with a place too, that lot
  there. The balance is today's on hand, less what moved after the
  row. With a reason or an order chosen, rows keep In and Out but no
  balance, since they leave movements out.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "works each row’s balance back from today’s on hand, across every place and at one, the same on every page and either way" ·
  [test](../../server/test/movements.e2e-spec.ts) "counts a lot’s balance alone, and that lot at one place" ·
  [test](../../server/test/movements.e2e-spec.ts) "gives one code’s date range its opening, In, Out and closing; a reason or an order keeps In and Out alone" ·
  [test](../../client/e2e/movements-page.spec.ts) "Movements, Item › E2E Vitamin C: In · Out · Balance replace Change; ?variantId=; Back leaves Movements" ·
  [test](../../client/e2e/movements-page.spec.ts) "Movements, one item, Reason › shipped: Balance, Opening and Closing go; In and Out stay, with “Balance counts every reason” and Clear Reason" ·
  [Help](../../client/src/help/guides/en/movements.md#read-one-code-like-a-stock-card-card) ·
  MC-319
- **Several items read each row's Change, signed as the list counts
  it:** what came in with its plus, what went out with its minus; with a
  place chosen, a move onto it In and a move off it Out; across every
  place, a move between two places neither, its quantity unsigned. The
  screen and the export read the one sign the server works out, so they
  never differ.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "signs a move off the place chosen with its minus, the same on the list and in its export" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "signs a move off the place chosen with its minus, as its export does" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "leaves a move between two places unsigned across every place" ·
  [Help](../../client/src/help/guides/en/movements.md#find-a-movement-find) ·
  MC-320
- **A date range for one code opens and closes: Opening, In, Out,
  Closing,** Closing the Opening plus In less Out, and a range ending
  today closing at today's on hand. With a reason chosen, In and Out
  alone. Never for several items, whose units differ.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "gives one code’s date range its opening, In, Out and closing; a reason or an order keeps In and Out alone" ·
  [test](../../client/e2e/movements-page.spec.ts) "Movements, one item, When › This month: ?from= and ?until= in the organization’s days; the period line, Opening, In, Out and Closing; Back leaves Movements" ·
  [Help](../../client/src/help/guides/en/movements.md#read-one-code-like-a-stock-card-card) ·
  MC-319
- **Movements' export is the screen's columns, oldest first, one value
  to each, then what a row keeps beyond them:** When to the second on
  the organization's clocks, its header naming the place its time zone
  is named for, "When (Vancouver time)"; Code; Recorded as, the code a
  row was recorded under where it differs from today's; Item; In, Out
  and Balance where the list has them, else Change; Unit, Reason, From,
  To, Lot, Expiry, For and By; Email, the person's; and the note last,
  as typed. One code's range starts with its opening balance and ends
  with its closing, each by its day, beside the range's In and Out.
  Reason in the screen's words with its detail, "Corrected: found". From
  and To, each place by its whole path, or an end outside the warehouse
  in the screen's words, supplier, customer, run, sample, counted in or
  counted out, only for a reader who may see places, else no such
  columns; For, the document or a sample's recipient, as the reader may
  see it.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "exports one code’s stock card oldest first, its opening first and its closing last" ·
  [test](../../server/test/movements.e2e-spec.ts) "exports when to the second in the organization’s zone, the code a row was recorded under, By’s email and the note" ·
  [test](../../server/test/movements.e2e-spec.ts) "exports each reason in the screen’s words with its detail, and an end outside the warehouse in words" ·
  [test](../../server/test/movements.e2e-spec.ts) "exports what the reader may see: no From or To for Sales, a run’s For empty" ·
  [test](../../client/e2e/movements-page.spec.ts) "a Sales reader: no From → to and no place named; a link with ?locationId= reads Everywhere; the export without From and To; a lot’s page with no shelf" ·
  [Help](../../client/src/help/guides/en/movements.md#export-the-list-export) ·
  MC-319
- **A movement names its places only to a reader who may see places,**
  each by its path, its warehouse first; the rest get each place's id
  alone, so a row still reads as in, out or between.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "lists each movement as one row: today’s code and the one it was recorded under, the lot, each place by its path" ·
  [test](../../server/test/movements.e2e-spec.ts) "names no place to a reader without locations.view, each place’s id kept" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "has no From → to for a reader without locations.view (96a)" ·
  [test](../../client/e2e/movements-page.spec.ts) "a Sales reader: no From → to and no place named; a link with ?locationId= reads Everywhere; the export without From and To; a lot’s page with no shelf" ·
  [Help](../../client/src/help/guides/en/movements.md#correct-a-mistake-correct) ·
  MC-3319
- **A movement names the document it was for only to a reader who may
  see it:** the order it was received, shipped or returned on with
  orders.view, the run with production.view (55a).
  [ADR-093](../adr/0093-inventory-and-movements.md) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "names the order each movement was received or shipped on, for a reader who may see orders" ·
  MC-305
- **A sample reads like a shipment:** its From → to ends "sample" in
  grey, never "—", and its For names the recipient Send sample
  recorded, a link to the partner, only to a reader who may see
  partners; "—" for anyone else, and when none was recorded. Its
  export's To writes "sample", and its For the recipient's name by the
  same permission.
  [ADR-093](../adr/0093-inventory-and-movements.md) ·
  [test](../../server/test/movements.e2e-spec.ts) "ends a sample at “sample” and names its recipient for a reader who may see partners, on the list and in its export" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "ends a sample at “sample” and links the recipient it was for (125)" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "says — for a sample whose recipient was not recorded, or is not the reader’s to see (125)" ·
  MC-320
- **An order's movements are what was received, shipped and returned on
  it,** a voided shipment's reversal among them, and only for a reader
  who may see orders: the rest are refused, in their words, before
  anything is read, since the answer alone would say which movements
  belong to it.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "lists an order’s movements alone: a purchase’s receipts, a sale’s shipments, their voids and its returns" ·
  [test](../../server/test/movements.e2e-spec.ts) "refuses an order’s movements to a reader without orders.view, on the list and its export" ·
  MC-321
- **An order's page lists its movements only to a reader who may see
  stock,** as Movements needs: a purchase's Receipts, read as Movements
  lists the order, and All movements of the order; a reader without
  stock.view gets neither.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../client/src/orders/order-detail-page.test.tsx) "lists a purchase’s receipts by its order, with All movements of it" ·
  [test](../../client/src/orders/order-detail-page.test.tsx) "offers neither without stock.view" ·
  [test](../../client/e2e/movements-page.spec.ts) "The order’s page, Receipts, All movements of PO-…: ?orderId=, a chip; In and Out, no balance; Back, the order’s page" ·
  [Help](../../client/src/help/guides/en/orders.md#receive-a-purchase-receive) ·
  MC-321
- **A link's place or order that its reader may not use is ignored on
  Movements,** as Stock's address is: a place without locations.view,
  or one no stock can sit at, reads every place; an order without
  orders.view, every movement, with no chip, so it is never asked.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../client/src/inventory/movements-page.test.tsx) "reads a place a reader may not see as Everywhere, never asking it" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "reads an order a reader may not see as every movement, with no chip" ·
  [test](../../client/e2e/movements-page.spec.ts) "a reader without orders.view: a link with ?orderId= reads every movement, with no chip" ·
  [test](../../client/e2e/movements-page.spec.ts) "a Sales reader: no From → to and no place named; a link with ?locationId= reads Everywhere; the export without From and To; a lot’s page with no shelf" ·
  [Help](../../client/src/help/guides/en/movements.md#correct-a-mistake-correct) ·
  MC-320

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
- **Where it is now names each place by its whole path, its warehouse
  first, only to a reader with locations.view;** the rest read the
  lot's usable and not usable, two sums from the server, and no place's
  name, code or path. Usable is at a place available while the lot has
  not expired by the organization's today; what runs were issued is
  counted by item, never by lot.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "names each place where it is now by its path, only to a reader with locations.view" ·
  [test](../../client/src/inventory/lot-trace-page.test.tsx) "names each place where it is now by its whole path, or sums it for a reader without places" ·
  [test](../../client/e2e/movements-page.spec.ts) "a Sales reader: no From → to and no place named; a link with ?locationId= reads Everywhere; the export without From and To; a lot’s page with no shelf" ·
  [Help](../../client/src/help/guides/en/lots.md#read-a-trace-read) ·
  MC-904

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
- **Latest movements are each code's five newest, as Movements lists the
  code:** the same rows, In, Out and the balance after each, the newest's
  balance its on hand, each part by the reader's sight as there.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "lists each code’s five newest movements as Movements lists the code, the newest’s balance on hand" ·
  [test](../../client/src/products/where-it-stands.test.tsx) "lists the code’s latest movements as a stock card, with All movements of the code" ·
  [test](../../client/e2e/movements-page.spec.ts) "The item’s page, Latest movements, All movements of E2E-VITC: ?variantId=, Movements, one item; Back, the item’s page" ·
  [Help](../../client/src/help/guides/en/items.md#where-it-stands-stands) ·
  MC-219
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
- **Reorder says how many codes it lists, always:** "4 codes" once every
  one is shown, and beside Show 50 more how many of how many; no row
  number; Back after Show 50 more reads the codes shown again, focus on
  the row left from.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../client/src/inventory/reorder-points-tab.test.tsx) "counts its codes once every one is shown, and Back after Show 50 more finds them" ·
  [Help](../../client/src/help/guides/en/inventory.md#where-an-item-stands-position) ·
  MC-323
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

## Counting in found stock

- **Stock found where an item has never been is counted in by Correct
  the count,** its reason found: into any place that holds stock
  directly, and for an item tracked by lot, one of its lots or a new lot
  made with the count, in the same write. It needs stock.adjust, as
  every correction does, and a note. A place with places inside it is
  refused, as for every movement, and nothing is written.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [test](../../server/test/stock.e2e-spec.ts) "makes a new lot with the count, at a place the item never was, and says it waits for a cost" ·
  [test](../../server/test/stock.e2e-spec.ts) "refuses a place that is not a leaf, as every movement, and makes no lot" ·
  [test](../../client/src/inventory/inventory-page.test.tsx) "ends a code’s opened places with Count it in…, and Escape returns to it" ·
  [Help](../../client/src/help/guides/en/inventory.md#move-ship-or-correct-move) ·
  [test](../../client/e2e/stock.spec.ts) "Count it in…, Save correction: a found correction into the place, a new lot made, “Counted in 12 each of E2E-VITC at E2E Shelf C3, new lot VC-0310. It waits for a cost.”; Stock, the row open at its new place" ·
  [test](../../client/e2e/stock.spec.ts) "Count it in…, Save correction, no lot chosen: “Choose one of its lots, or a new lot.” at its field, focus on it" ·
  MC-322
- **A new lot's code must be one the item does not have yet:** a code
  it has is refused, naming that lot, at the new lot's code (the code
  `lot_code_in_use`), before anything is written; one of its lots is
  chosen as such. Receiving the same code again still adds to that lot.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [test](../../server/test/stock.e2e-spec.ts) "refuses a new lot whose code the item has, naming it at its field, and writes nothing" ·
  [test](../../client/src/inventory/count-in-dialog.test.tsx) "says a code the item has at the lot number, focused there" ·
  MC-322
- **Found stock in a new lot, or of an item with no cost yet, waits for
  a cost,** and its message says so, linked to Stock value's Waiting for
  a cost for a reader who may see costs; found stock in a lot the item
  has rides at that lot's average.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [test](../../server/test/stock.e2e-spec.ts) "makes a new lot with the count, at a place the item never was, and says it waits for a cost" ·
  [test](../../server/test/stock.e2e-spec.ts) "counts into a lot the item has at its average, not waiting for a cost" ·
  [test](../../client/src/inventory/count-in-dialog.test.tsx) "makes a new lot with the count, saying it waits for a cost, linked to Waiting for a cost" ·
  MC-322
