# Stock

What the app allows, refuses and works out for stock, as the code does
it today: usable stock, a code's figures, Inventory's list and Lot view,
Movements, a lot's trace, Where it stands, Reorder, what confirmed sales
hold, what may be taken, stock found where it never was, a new lot at
receipt, a lot's details corrected, lot tracking started and stock moved
to another lot, as ADR-093's Inventory branch
completed it, its Movements branch grows it and ADR-094's lots at
receipt grow it again. Each
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
- **A lot whose expiry is not known yet stays usable:** it is never
  expired, in no Expired or Expiring soon, and never what expires first,
  even on a day far ahead; earliest expiry first takes it as a lot with
  no expiry, after the dated ones, by when it arrived. Every screen
  reads it "Expiry to add", never "No expiry"; Ship names each such lot
  it will take in an amber line and still ships, the packing slip
  reading the lot's expiry as it is when printed (D2).
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--an-expiry-is-a-date-not-known-yet-or-none) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "reads a lot whose expiry is not known yet as usable, never expired nor first to expire, taken as a lot with no day (ADR-094, R9)" ·
  [test](../../client/src/inventory/lot-expiry.test.ts) "says beside a code its day, Expiry to add while it is not known, and No expiry for one that does not expire" ·
  [test](../../client/src/orders/ship-order-dialog.test.tsx) "warns of a lot it will take whose expiry is still to add, naming it, and still ships" ·
  MC-332

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
  with no lots has none. Where every unit on hand has expired, wherever
  it sits, a place not available too, it reads "all expired", never "—".
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--a-row-per-code-opening-to-its-places-and-lots) ·
  [test](../../server/test/code-figures.e2e-spec.ts) "works out each figure of a code from the movements recorded, each sum holding" ·
  [test](../../server/test/code-figures.e2e-spec.ts) "says every unit on hand has expired, an expired lot at a place not available among them" ·
  [test](../../client/src/inventory/inventory-page.test.tsx) "says all expired where every unit on hand has, and — where nothing expires" ·
  [test](../../client/src/inventory/inventory-page.test.tsx) "says all expired where an expired lot sits at a place not available too" ·
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
- **A lot's code or its supplier's lot searched with a place chosen
  finds that lot at that place alone,** never a code whose matching lot
  is held elsewhere; either code finds the lot, any part of it, capitals
  aside, on Stock and on the Lot view (ADR-094, R6).
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [ADR-056, amended](../adr/0056-search.md#amendment-november-2026--a-lot-found-by-its-suppliers-lot-adr-094) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "finds a lot by its code at the place chosen alone, never one held elsewhere" ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "finds a code by any part of a lot’s supplier’s lot, capitals aside, at the place chosen alone (ADR-094, R6)" ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "lists a lot by any part of its supplier’s lot, beside the lots its own code finds (ADR-094, R6)" ·
  [Help](../../client/src/help/guides/en/inventory.md#find-stock-find) ·
  MC-314 · MC-909
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
- **Each count says what it counts, beside its number:** a quick
  filter's after a dot, "Low stock · 8 codes" on Stock by item and on
  Reorder, "Expiring soon · 4 lots" on the Lot view, "Low stock · 2
  items" on Items, by each language's plural; Home's Low stock and
  Expiring soon tiles beside the figure, "8 codes" and "4 lots" (108a).
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../client/src/components/filter-row.test.tsx) "says what it counts beside the number, by the plural" ·
  [test](../../client/src/inventory/inventory-page.test.tsx) "lists a row per lot with its own counts, Out not among its filters" ·
  [test](../../client/src/inventory/reorder-points-tab.test.tsx) "opens on Low from the address, with the counts beside each view" ·
  [test](../../client/src/products/products-page.test.tsx) "narrows to the items low or out by Low stock, its count beside it, in the address" ·
  [test](../../client/src/home/home-cards.test.ts) "says what Low stock and Expiring soon count, in each language" ·
  [Help](../../client/src/help/guides/en/inventory.md#what-each-count-counts-counts) ·
  MC-1528 · MC-313 · MC-4202 · MC-4213 · MC-311
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
  codes:** Low stock, Expiring soon, Expired, Waiting for a cost and
  Details to add, each with the other filters on and its own off; no
  Out, since a code that is out keeps no lot. Its export is the same
  rows.
  [ADR-093](../adr/0093-inventory-and-movements.md#decision--group-by-item-or-lot-one-place-now) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "counts each of the Lot view’s quick filters as the lots it shows, with the other filters on, and exports those rows" ·
  [Help](../../client/src/help/guides/en/inventory.md#what-each-count-counts-counts) ·
  MC-313
- **Details to add lists the lots not yet finished:** one whose expiry
  is not known yet, and one whose code was made here and whose
  supplier's lot is still to add, each pile at every place a row. Every
  read of a pile, a lot or a movement sends the lot's expiry and its
  supplier's lot.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--an-expiry-is-a-date-not-known-yet-or-none) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "lists and counts Details to add as the lots it shows, each read and export with the lot’s expiry and supplier’s lot (ADR-094, R9)"
- **A code's opened row lists, with Include empty, its emptied piles
  too,** but not the emptied pile with no lot of a code that now tracks
  lots: its stock from before is in a lot. At one place chosen, a code
  whose only pile there is that one is not listed either. Each row says
  whether its code tracks lots, its own, never told by its piles.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "says whether a code was ever stocked here, and the day each emptied pile was emptied" ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "leaves out, with Include empty, the emptied pile with no lot of a code that now tracks lots (ADR-094)" ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "lists at one place, with Include empty, no code whose only pile there is the emptied one with no lot of a code that now tracks lots, and says each code’s own tracking (ADR-094)"
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
- **The Lot view's and Movements' exports write each lot's supplier's
  lot and its expiry beside its code,** each marked where it is still
  to add: Supplier's lot, the supplier's own for a code made here, or
  "Supplier's lot to add", empty for a printed code; Expiry, its day, or
  "Expiry to add", empty for a lot that does not expire.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--an-expiry-is-a-date-not-known-yet-or-none) ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "lists and counts Details to add as the lots it shows, each read and export with the lot’s expiry and supplier’s lot (ADR-094, R9)" ·
  [Help](../../client/src/help/guides/en/movements.md#export-the-list-export) ·
  MC-317 · MC-319
- **Every stock export writes a quantity as data without its padding
  zeros, never rounded:** `600`, not `600.0000`; `12.5` and `0.0001` as
  they are; a minus kept, `-5`; no grouping. Stock's, the Lot view's,
  Movements', Reorder's, Stock value's and the recall list's; the
  organization's full export keeps each as stored.
  [ADR-057, amended](../adr/0057-lists-by-date-range-sorted-where-it-helps-exported-as-csv.md#amendment-november-2026--inventorys-and-movements-sorts-adr-093) ·
  [test](../../server/test/exports.e2e-spec.ts) "writes every quantity without its padding zeros, 600, 12.5 and 0.0001, and money at its currency’s places" ·
  [test](../../server/src/common/export.spec.ts) "drops the padding zeros of a quantity, and money’s down to its currency’s places" ·
  MC-1558
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
  organization's days. A reload, a link and Back keep them; every filter
  that is set shows as a chip under the row, on a phone too: the item,
  the place, the lot, the order, the reason and the days, each chip's ×
  clearing its own filter alone; a lot and an order each by its code or
  number though no movement listed carries it. The item, a lot and an
  order are chosen in one find box, Find an item, lot or order, which
  reads the top bar's lookup, its kinds by the reader's permissions, and
  offers items, lots and orders alone, never a run or a return, the
  exact matches alone while any match, a lot by its code or its
  supplier's lot, the supplier's lot named on its option, a whole lot
  code or supplier's lot its lot alone,
  and the close ones, a typo's, under Close matches only when none does:
  an item sets the item, a lot its item and the lot, an order the order,
  each then a chip, the box emptied; what is typed alone never filters. An archived code,
  which the item list does not hold, is named on its chip from its
  movements, and kept once a
  filter leaves none; one that neither the list nor a movement names,
  a discontinued code with nothing in the days chosen, by its own read
  under stock.view in the reader's organization, its chip and the
  no-result line saying "(discontinued)" when it is (133b); Show all movements clears every one in a single
  write and keeps the sort. On a phone the Filters sheet's Clear clears
  the sheet's own fields alone, the lot's and the order's chips kept.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../client/src/inventory/movements-page.test.tsx) "asks the list by the address’s keys, the lot and the order as chips" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "shows a chip for every filter set, each × clearing its own key" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "offers items, lots and orders in words, grouped, never a run or a return" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "sets a lot’s item and the lot by the keyboard, each a chip, the box emptied" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "sets an order by its option, its chip under the row; Escape closes the list" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "offers only the exact matches while any match exactly" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "offers the close matches under Close matches only when nothing matches exactly" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "offers a whole lot code alone; chosen, the box empties and the lot stays as its chip" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "offers a lot whose whole supplier’s lot is typed alone, naming it" ·
  [test](../../client/e2e/movements-page.spec.ts) "Movements, Find an item, lot or order › a lot by the keyboard: its item and the lot, each a chip, a stock card; › an order: its chip" ·
  [test](../../server/test/lookup.e2e-spec.ts) "says an order's direction and how much of it has come, and neither for other kinds" ·
  [test](../../client/e2e/stock.spec.ts) "Stock, a lot’s Actions › Movements, Location › its shelf, then × Lot and × Item: Movements of the shelf alone, its chip left" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "names a lot no row carries, on its chip and in what no result names" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "names an order no row carries, on its chip and in what no result names" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "names a code the picker does not list from its rows, and keeps it when none match" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "names a discontinued code no row and no option names by its own read, said discontinued" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "names a code in use by its own read for a reader whose picker is empty, nothing added" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "never reads a code a row or the picker names" ·
  [test](../../server/test/movements.e2e-spec.ts) "reads one code by its id, its name, code, unit and whether in use, in its organization alone" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "clears every filter and chip in one write with Show all movements, the sort kept" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "clears the sheet’s own fields with its Clear, the lot and order chips kept" ·
  [test](../../client/e2e/movements-page.spec.ts) "Movements, every filter in the address: a reload keeps each, and the rows" ·
  [test](../../client/e2e/movements-page.spec.ts) "Movements, a filter on, Show all movements: every filter and chip cleared in one address write; Back leaves Movements" ·
  [Help](../../client/src/help/guides/en/movements.md#find-a-movement-find) ·
  MC-320 · MC-909
- **A movement is one row on every screen that lists one:** the item's
  name with today's code and type, "was" the code it was recorded under
  where that differs, the change with its unit, the reason, the lot with
  its expiry, the document it was for and who did it, the same cells on
  Movements, the item's Latest movements and an order's Receipts. The
  reason reads in the same words in the row, the Reason filter and its
  chip, the export and the Activity log, each with its capital where it
  stands alone (136a): Received, Shipped, Moved, Corrected, Made, Used in
  a run, Sampled and Returned, never the Activity log's old Receipt or
  Shipment; a correction's detail, Miscount, Damaged, Expired, Lost or
  Found in Correct the count's Why, after a colon in lower case,
  "Corrected: found", as a reason is inside the no-result line. A voided
  shipment's goods back read "Corrected: shipment voided" in the
  reader's language, the rows stored in English before November 2026
  too (#647).
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "lists each movement as one row: today’s code and the one it was recorded under, the lot, each place by its path" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "names the item first, its code and type grey under it, and reads the change with its unit" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "keeps a changed code’s old one under today’s" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "says a reason in the boards’ words, a correction’s detail after it" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "offers each reason in the boards’ words" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "says a reason with its capital in French, its detail in lower case" ·
  [test](../../client/src/inventory/move-stock-dialog.test.tsx) "offers each Why with its capital" ·
  [test](../../client/src/products/where-it-stands.test.tsx) "lists the code’s latest movements as a stock card, with All movements of the code" ·
  [test](../../server/test/movements.e2e-spec.ts) "exports each reason in the screen’s words with its detail, and an end outside the warehouse in words" ·
  [test](../../server/test/movements.e2e-spec.ts) "reads a voided shipment’s goods back by their key, one stored as English text too, in each language’s words (#647)" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "says a voided shipment’s goods back in Chinese, never in English" ·
  [test](../../server/src/core/audit/audit-words.spec.ts) "reads the reason in Movements’ words, in each language" ·
  [Help](../../client/src/help/guides/en/movements.md#find-a-movement-find) ·
  MC-320 · MC-R105
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
  holds: its row says how many moved once, across In and Out, in grey,
  "moved 20 each, counted in neither", on a phone's card too, and the
  sums leave it out; with a place chosen, that place alone, a move out of it Out;
  with a lot chosen, that lot alone, and with a place too, that lot
  there. A lot change is neither for the code, at its place too; with a
  lot chosen, it is Out of the lot it leaves and In to the lot it
  enters. The balance is today's on hand, less what moved after the
  row. With a reason or an order chosen, rows keep In and Out but no
  balance, since they leave movements out. Several items at a place
  alone ask for one item to see the balance; with an order chosen they
  never do, since one item would bring no balance.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "works each row’s balance back from today’s on hand, across every place and at one, the same on every page and either way" ·
  [test](../../server/test/movements.e2e-spec.ts) "counts a lot’s balance alone, and that lot at one place" ·
  [test](../../server/test/movements.e2e-spec.ts) "gives one code’s date range its opening, In, Out and closing; a reason or an order keeps In and Out alone" ·
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "keeps the stock card’s balance, a lot change in neither In nor Out, and counts it In for the lot (R16)" ·
  [test](../../client/e2e/movements-page.spec.ts) "Movements, Item › E2E Vitamin C: In · Out · Balance replace Change; ?variantId=; Back leaves Movements" ·
  [test](../../client/e2e/movements-page.spec.ts) "Movements, one item, Reason › Shipped: Balance, Opening and Closing go; In and Out stay, with “Balance counts every reason” and Clear Reason" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "says a move counted in neither once across In and Out, Balance as it was" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "says a move counted in neither on its card in its row’s words" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "says to choose one item while every item is listed at a place" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "says nothing of Balance with an order chosen, at a place or not" ·
  [Help](../../client/src/help/guides/en/movements.md#read-one-code-like-a-stock-card-card) ·
  MC-319
- **Several items read each row's Change, signed as the list counts
  it:** what came in with its plus, what went out with its minus; with a
  place chosen, a move onto it In and a move off it Out; across every
  place, a move between two places neither, which the screen says in
  words, "moved 20 each", never a bare number, and the export writes
  unsigned. The screen and the export read the one sign the server works
  out, so they never differ.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "signs a move off the place chosen with its minus, the same on the list and in its export" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "signs a move off the place chosen with its minus, as its export does" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "says how many a move between two places moved across every place, never a bare number" ·
  [Help](../../client/src/help/guides/en/movements.md#find-a-movement-find) ·
  MC-320
- **A date range for one code opens and closes: Opening, In, Out,
  Closing,** Closing the Opening plus In less Out, and a range ending
  today, or after it, closing at today's on hand, dated today, on the
  screen as in the export. With a reason chosen, In and Out
  alone. Never for several items, whose units differ.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "gives one code’s date range its opening, In, Out and closing; a reason or an order keeps In and Out alone" ·
  [test](../../client/e2e/movements-page.spec.ts) "Movements, one item, When › This month: ?from= and ?until= in the organization’s days; the period line, Opening, In, Out and Closing; Back leaves Movements" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "dates Closing today while the range runs past it, Opening as it was" ·
  [Help](../../client/src/help/guides/en/movements.md#read-one-code-like-a-stock-card-card) ·
  MC-319
- **When's periods are the organization's days, both included:** Today;
  This week from Monday, This month, Last 30 days and This year, each
  ending today; Last month whole. Today is the organization's, by its
  time zone, never the browser's (135a); the days are counted on the
  calendar, never by taking hours away, so Last 30 days on 20 November
  starts at midnight on 22 October whatever the clocks did between; a
  week starts on Monday for every reader and language, as ISO 8601 has
  it (137a). Choose dates… takes either end alone.
  A code's All movements of…, under Where it stands, opens on this
  month, so its four figures show at once.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [test](../../client/src/inventory/when-menu.test.tsx) "offers each period with its own days, a period that holds today ending today, then Choose dates… and Any time at its foot" ·
  [test](../../client/src/inventory/when-menu.test.tsx) "WhenMenu, in the organization’s days wherever the browser is" ·
  [test](../../client/src/lib/date-range.test.ts) "starts a week on Monday, a Sunday’s on the Monday before, across a month and a year" ·
  [test](../../client/src/lib/date-range.test.ts) "counts calendar days across a change of clocks, each beginning at midnight in the organization’s zone" ·
  [test](../../client/src/products/where-it-stands.test.tsx) "lists the code’s latest movements as a stock card, with All movements of the code" ·
  [test](../../client/e2e/movements-page.spec.ts) "The item’s page, Latest movements, All movements of E2E-VITC: ?variantId=, Movements, one item; Back, the item’s page" ·
  [Help](../../client/src/help/guides/en/movements.md#find-a-movement-find) ·
  MC-320
- **Movements' export is the screen's columns, oldest first, one value
  to each, then what a row keeps beyond them:** When to the second on
  the organization's clocks, its header naming the place its time zone
  is named for, "When (Vancouver time)", in Chinese by ICU's short
  generic name, the city in Chinese and the same in every season,
  "时间（温哥华时间）" (134b); Code; Recorded as, the code a
  row was recorded under where it differs from today's; Item; In, Out
  and Balance where the list has them, else Change, and the stock card's
  Moved between Out and Balance, filled on a move counted in neither
  alone, a lot change's too; Unit, Reason; Reason code, the reason's
  stable code (receipt, shipment, transfer, adjustment, production,
  consumption, sample, return or lot_change), never translated, so
  exports in two languages can be put together (138b); From,
  To, Lot, To lot, the lot a lot change puts the stock into, empty on
  every other movement, Supplier's lot, Expiry, For and By; Email, the
  person's; and the note last, as typed. One code's range starts with its opening balance and ends
  with its closing, each by its day, beside the range's In and Out.
  Reason in the screen's words with its detail, "Corrected: found", a
  lot change as its action, "Moved to another lot" (ADR-094, U1). From
  and To, each place by its whole path, or an end outside the warehouse
  in the screen's words, supplier, customer, run, sample, counted in or
  counted out, only for a reader who may see places, else no such
  columns; a receipt's From its partner by name, as the reader may see
  it, or with none by why it came, opening stock, customer for stock
  brought back, other, else supplier, as Movements' From → to reads it
  (ADR-094, D3, amending 82a), where a why that a tab opened before a
  deploy does not know yet reads —, never supplier (D4); For, the document or a sample's
  recipient, as the reader may see it, never a receipt's partner.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "exports one code’s stock card oldest first, its opening first and its closing last" ·
  [test](../../server/test/movements.e2e-spec.ts) "exports when to the second in the organization’s zone, the code a row was recorded under, By’s email and the note" ·
  [test](../../server/src/common/today.spec.ts) "names the city in Chinese by ICU, and from the id in English and French" ·
  [test](../../server/test/movements.e2e-spec.ts) "exports each reason in the screen’s words with its detail, and an end outside the warehouse in words" ·
  [test](../../server/test/movements.e2e-spec.ts) "exports each reason’s code after its words, the same in every language" ·
  [test](../../server/test/movements.e2e-spec.ts) "exports what the reader may see: no From or To for Sales, a run’s For empty" ·
  [test](../../server/test/stock-grouped.e2e-spec.ts) "lists and counts Details to add as the lots it shows, each read and export with the lot’s expiry and supplier’s lot (ADR-094, R9)" ·
  [test](../../server/test/lot-changes.e2e-spec.ts) "reads a lot change’s second lot back on Movements, Out of the first and In to the second, and the other lot in each lot’s cost history (R20)" ·
  [test](../../client/e2e/movements-page.spec.ts) "a Sales reader: no From → to and no place named; a link with ?locationId= reads Everywhere; the export without From and To; a lot’s page with no shelf" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "starts a receipt with a detail this tab does not know at —, never supplier (D4)" ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "names who it came from, a partner of this organization alone, on the movement and as its export’s From, For staying the document’s (D3)" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "starts a receipt at the partner it came from, a link, For reading — (D3)" ·
  [Help](../../client/src/help/guides/en/movements.md#export-the-list-export) ·
  MC-319 · MC-331 · MC-333
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
- **A reader without locations.view is told why no place is named,
  once a page, where the places would be:** "Warehouses, zones and bins
  are hidden: your role can't see them. An Owner or Admin can change
  that.", in the role editor's words for the permission. On Movements
  above the list; on a lot's page under Where it is now; on the item's
  page in Where it stands' first card with stock; on Stock, where a
  code not tracked by lot opens to it in place of a row of "—" for each
  place.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../client/src/inventory/movements-page.test.tsx) "says once why places are hidden for a reader without locations.view, never for one with it" ·
  [test](../../client/src/inventory/lot-trace-page.test.tsx) "names each place where it is now by its whole path, or sums it for a reader without places" ·
  [test](../../client/src/products/where-it-stands.test.tsx) "says once why places are hidden, for a reader without locations.view" ·
  [test](../../client/src/inventory/inventory-page.test.tsx) "opens a code not tracked by lot to why its places are hidden, for a reader without places" ·
  [test](../../client/e2e/movements-page.spec.ts) "a Sales reader: no From → to and no place named; a link with ?locationId= reads Everywhere; the export without From and To; a lot’s page with no shelf" ·
  MC-220 ·
  MC-312 ·
  MC-320 ·
  MC-904
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
- **A purchase's Receipts are for whoever may see the order,** its own
  read under orders.view, stock.view or not (102a): When, Item,
  Received, Lot and By, read as Movements lists the order's receipts;
  Where only with locations.view (96a); All movements of the order only
  with stock.view, as Movements needs.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../server/test/movements.e2e-spec.ts) "lists a purchase’s receipts under orders.view alone, Where only with locations.view" ·
  [test](../../client/src/orders/order-detail-page.test.tsx) "lists a purchase’s receipts by its order, with All movements of it" ·
  [test](../../client/src/orders/order-detail-page.test.tsx) "lists a purchase’s receipts without stock.view, with no Where and no All movements" ·
  [test](../../client/e2e/movements-page.spec.ts) "The order’s page, Receipts, All movements of PO-…: ?orderId=, a chip; In and Out, no balance; Back, the order’s page" ·
  [Help](../../client/src/help/guides/en/orders.md#receive-a-purchase-receive) ·
  MC-321
- **A lot's page leads to its item and to its movements, each only for
  a reader who may open that page:** the item's name links to the
  item's page with products.view, and reads as text without it; All
  movements of this lot, with stock.view, opens Movements on its item
  and that lot, so the stock card counts the lot, and with no days, so
  it reads the lot's whole life from its receipt, as a lot's Actions ›
  Movements on Stock does (132b).
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../client/src/inventory/lot-trace-page.test.tsx) "links its item and All movements of this lot, each for whoever may open it" ·
  [test](../../client/src/inventory/inventory-page.test.tsx) "opens a Lot view row’s Movements on the lot’s whole life, no days" ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "carries its item’s variant and product, for the links to them" ·
  [Help](../../client/src/help/guides/en/lots.md#read-a-trace-read) ·
  MC-902
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

- **A lot's recall list is everyone who received it, anything made
  from it, or any lot its stock moved into,** through as many runs and
  moves as lead there, each row under the lot they received, with how
  much was shipped, sampled and returned and the day it first left; its
  export is the same rows, each lot's supplier's lot after its code, in
  the reader's language, for a reader with stock.view.
  [ADR-044, amended](../adr/0044-lot-trace.md#amendment-november-2026--the-recall-lists-export-and-a-lots-expired-days-adr-093) ·
  [ADR-044, amended again](../adr/0044-lot-trace.md#amendment-november-2026--the-trace-follows-a-move-between-lots-and-one-rule-for-the-lot-search-adr-094) ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "follows an ingredient through the batch to everyone who received it" ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "exports the recall list as Who received it lists it, in the reader’s words" ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "lists on the first lot’s recall list a customer who received only the second lot, with the lot it came through, on the page and in the export (R21)" ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "follows a chain of three moves and a move back, each lot once, the recall list naming each lot’s supplier’s lot (R21)" ·
  [Help](../../client/src/help/guides/en/lots.md#read-a-trace-read) ·
  MC-906 · MC-908
- **A move between lots is followed as the same stock:** Made from and
  Went into list a lot its stock moved from or into as many runs away
  as the lot it moved with, through the same run; a move alone is no
  step, and each lot is listed once, a move back included.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "lists on the first lot’s recall list a customer who received only the second lot, with the lot it came through, on the page and in the export (R21)" ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "follows a chain of three moves and a move back, each lot once, the recall list naming each lot’s supplier’s lot (R21)" ·
  MC-908
- **Where a lot came from is each way stock came into it:** a receipt,
  with its order and supplier, or with none, why it came and from whom;
  a run that made it, with its licence; a move from another lot, naming
  that lot; and for the lot that took an item's stock, the stock on
  hand when lot tracking started and stock back from before it, which
  name none.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "lists on the first lot’s recall list a customer who received only the second lot, with the lot it came through, on the page and in the export (R21)" ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "says where a start lot came from: the stock on hand when lot tracking started, and stock back from before it (R21, Q4a)" ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "names who a receipt with no order came from and why, and an order’s supplier by its partner (ADR-094, E2)" ·
  [Help](../../client/src/help/guides/en/lots.md#read-a-trace-read)
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
- **Where it is now lists the lots its stock moved on to,** by moves
  alone, any number of hops, each with all it holds now, read as Where
  it is now reads the lot itself, stock it held before the move too: a
  recall reaches more, never fewer. A lot reached through a run is in
  Went into instead, and one emptied since is listed holding nothing.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lot-trace.e2e-spec.ts) "lists the lots its stock moved on to, by moves alone and any number of hops, with all each holds now, a place named only with locations.view (S9)" ·
  [test](../../client/src/inventory/lot-trace-page.test.tsx) "lists the lots its stock moved on to under Where it is now, each a link with all it holds, by place or summed for a reader without places (S9)" ·
  MC-908

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
- **A row opens by Who waits, which counts the orders waiting:** the
  confirmed sales whose lines its Still needed sums, "Who waits · 2
  orders", by each language's plural; a sale shipped in full or closed
  short waits no more. Still needed and Held keep their names (107a).
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#amendment-november-2026--movements-branch-before-building) ·
  [test](../../server/test/reorder-points.e2e-spec.ts) "counts on each row the confirmed sales still needing it" ·
  [test](../../client/src/inventory/reorder-points-tab.test.tsx) "says on each row who waits, in words, by the plural" ·
  [Help](../../client/src/help/guides/en/inventory.md#where-an-item-stands-position) ·
  MC-4204
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

## Receiving a new lot

- **A new lot's code is typed as printed, or made for us when the write
  is saved,** in Receive stock, an order's Receive and Count it in…. A
  made code comes from the organization's lot series by its today,
  `L-2026-11-21-1` and then `-2` by default; two writes at once never
  share one, and a write refused uses none. The write answers with the
  lot's code, for its message to name, and whether it waits for a cost.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--our-own-lot-codes-by-a-format-beside-document-numbering) ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "makes a code for us when saved, stored as made here with the supplier’s lot as printed, one after another" ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "makes two codes at once without sharing one" ·
  [Help](../../client/src/help/guides/en/inventory.md#receive-stock-receive) ·
  MC-325
- **The lot series prints capitals, digits, hyphens and the date, in 20
  characters with its digits,** what a barcode's lot field holds, set in
  Organization › Documents › Lot codes, which says so under its row,
  and that a code typed from a box stays as printed: a prefix holding
  anything else,
  or printing more than 20 with its digits, is refused there, and one a
  document's series could print the same as. Under the next code the row
  says how many codes fit within 20 characters, a day, a month, a year or
  in all, in amber where fewer than 10,000 fit in a year or in all, never
  for a day's or a month's. A code grows past 20 once its counter
  outgrows its digits, as a document's number does, and no receipt is
  refused for it.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--our-own-lot-codes-by-a-format-beside-document-numbering) ·
  [test](../../server/src/modules/numbering/numbering-format.spec.ts) "prints at most 20 characters with its digits" ·
  [test](../../server/test/numbering.e2e-spec.ts) "refuses a lot code prefix past 20 characters with its digits, or holding _ or / (ADR-094)" ·
  [test](../../server/test/numbering.e2e-spec.ts) "refuses a lot code prefix a document’s could print the same as (ADR-094)" ·
  [test](../../client/src/settings/numbering-section.test.tsx) "shows the next code made today, with the room for codes a day within 20 characters" ·
  [test](../../client/src/settings/numbering-section.test.tsx) "warns in amber with room for 9,999 in all, and Save still works; as many a day stay grey" ·
  [test](../../server/test/numbering.e2e-spec.ts) "makes a code past 20 characters once its counter outgrows its digits, and refuses no receipt for it" ·
  [test](../../client/src/settings/numbering-section.test.tsx) "says under the lot codes that the 20 characters bind the codes we make, not one typed from a box" ·
  [Help](../../client/src/help/guides/en/organization.md#numbering-numbering) ·
  MC-2701
- **A made code is stored as made here, a typed one as printed,** never
  as made here, whatever the movement's reason; a made code can be
  corrected later, a printed one cannot.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--our-own-lot-codes-by-a-format-beside-document-numbering) ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "stores a typed code as printed, never as made here" ·
  [test](../../server/test/stock.e2e-spec.ts) "renames a code this organization invented" ·
  [test](../../server/test/stock.e2e-spec.ts) "refuses to rename a supplier-printed code"
- **The supplier's lot goes with a made code alone,** as printed, its
  case kept; a typed code is the supplier's own, so a write giving both
  is refused, saying to leave the supplier's lot empty.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--the-suppliers-lot-beside-our-code) ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "makes a code for us when saved, stored as made here with the supplier’s lot as printed, one after another" ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "refuses a new lot it cannot read, saying what to do, and writes nothing"
- **A new lot's expiry is a date, not known yet, or none,** with a day
  exactly for a date, a write that contradicts it refused. The
  database's own check holds the two together for every write to a lot,
  whatever makes it; nothing sets the kind from the day any more. A write
  naming no kind, as a tab opened before sends it, reads a date with a
  day and none without. A lot that exists keeps its expiry when more of
  its code arrives. A day already past, or more than 10 years away, is
  warned of in amber at the field, wherever an expiry is asked, and
  never refused.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--an-expiry-is-a-date-not-known-yet-or-none) ·
  [ADR-094, amended](../adr/0094-lots-at-receipt.md#amendment-november-2026--the-branch-after-a-late-cost-follows-each-unit-once-stock-value-by-the-page-a-lots-former-code-678-664-665) ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "refuses a lot written straight to the table with a day and the kind none, on insert and on update (ADR-094 amended, R3)" ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "stores each of the three expiries, and a day alone or none as a tab opened before sends them" ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "refuses a new lot it cannot read, saying what to do, and writes nothing" ·
  [test](../../client/src/inventory/lot-fields.test.tsx) "warns at the day of one already past, or more than 10 years away, and refuses neither"
- **A receipt with no order says why: opening stock, returned, a sample
  or other,** other with a note or without, or nothing, as a tab opened
  before sends it; anything else is refused, naming the four. Movements'
  export reads "Received: opening stock".
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-receipt-with-no-order-says-why-and-from-whom) ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "a receipt with no order (R11)" ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "refuses a why that is not one of them, saying the four, and writes nothing"
- **A new lot's Expires starts as the item's newest lot had it,** none
  chosen for an item's first lot, and on Not known yet for a code made
  for us, until the person chooses; a typed code the item has asks no
  expiry, its own kept. Nothing is received until a new lot's expiry is
  chosen, with its day for a date.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--an-expiry-is-a-date-not-known-yet-or-none) ·
  [test](../../client/src/inventory/lot-fields.test.tsx) "starts Expires as the item’s last lot had it, each of the three" ·
  [test](../../client/src/inventory/lot-fields.test.tsx) "has none chosen for a first lot" ·
  [test](../../client/src/inventory/lot-fields.test.tsx) "makes a code for us when saved, offering the supplier’s lot and starting Expires on Not known yet; Type one instead empties the field, focus in it" ·
  [test](../../client/src/inventory/lot-fields.test.tsx) "says a typed code is a lot the item has, which this adds to, with its expiry and what is where, and asks no expiry"
- **Receive stock asks why there is no order of every receipt it
  makes,** and receives nothing until it is answered. Found in a count
  is no receipt: it opens Count it in… with the item and the place, for
  whoever may correct counts.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-receipt-with-no-order-says-why-and-from-whom) ·
  [test](../../client/src/inventory/receive-stock-dialog.test.tsx) "says what each empty field needs, focusing the first" ·
  [test](../../client/src/inventory/receive-stock-dialog.test.tsx) "opens Count it in… for Found in a count with the item and place, then gives focus back to the question"
- **A receipt with no order may name whom it came from,** a partner of
  this organization, kept as a sample's recipient is and read as the
  From end of its From → to on Movements and in its export's From, For
  staying the document's (D3); without From → to, for a reader without
  locations.view, it follows the reason, "Received: returned · from …",
  as a partner is not a place (S7); the lot's Where it came from names
  it too. Another organization's partner is refused, and so is a partner
  on a count or on an order's receipt.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-receipt-with-no-order-says-why-and-from-whom) ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "names who it came from, a partner of this organization alone, on the movement and as its export’s From, For staying the document’s (D3)" ·
  [test](../../client/src/inventory/lot-trace-page.test.tsx) "says where it came from: the lot it moved from, tracking started, back from before, and a receipt with no order from whom and why" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "names a receipt’s partner after its reason for a reader with no From → to, a link with partners.view (S7)" ·
  MC-333 · MC-910
- **A write with no lot for a code that tracks lots is refused,** saying
  lot tracking has started for that code and to reload to give its lot:
  a tab that sends none read the code before its tracking started.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "says lot tracking has started, to reload, where a write sends no lot"

## Correcting a lot's details

- **Edit lot details moves any lot between the three expiries:** a
  date, not known yet, or none, so a day can be taken away and given
  again; a day exactly for a date, a correction that contradicts it
  refused, nothing changed. A day alone, as a tab opened before sends
  it, reads a date; an expiry not named stays as it is. Correcting a
  lot needs stock.move, from a pile's Actions or the lot's own page.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--an-expiry-is-a-date-not-known-yet-or-none) ·
  [test](../../server/test/stock.e2e-spec.ts) "moves a lot between the three expiries, a day taken away and given again (ADR-094, R8)" ·
  [test](../../server/test/stock.e2e-spec.ts) "refuses an expiry it cannot read, saying what to do, and changes nothing (ADR-094, R8)" ·
  [test](../../server/test/stock.e2e-spec.ts) "corrects the expiry on any lot" ·
  [test](../../server/test/stock.e2e-spec.ts) "refuses a Viewer, which lacks stock.move" ·
  [test](../../client/src/inventory/lot-trace-page.test.tsx) "edits the lot’s details from its own page for whoever may move stock, reading it again after" ·
  [test](../../client/src/inventory/lot-trace-page.test.tsx) "offers no Edit lot details to whoever may not move stock" ·
  [Help](../../client/src/help/guides/en/inventory.md#move-ship-or-correct-move) ·
  MC-329
- **A lot made here takes its supplier's lot when it is known,** as
  printed, its case kept; emptied, it is to add again. A code typed from
  the box is the supplier's own, so a supplier's lot for it is refused,
  saying to leave it empty or say we made the code up, and nothing is
  changed.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--the-suppliers-lot-beside-our-code) ·
  [test](../../server/test/stock.e2e-spec.ts) "adds the supplier’s lot to a lot made here, as printed, and takes it away again (ADR-094, R5)" ·
  [test](../../server/test/stock.e2e-spec.ts) "refuses a supplier’s lot for a code typed from the box, saying what to do, and changes nothing (ADR-094, R5)"
- **An older code typed up here is marked as made here by
  stock.lot_made_here alone,** the Owner's at first: one way, never
  unmarked, a second mark changing nothing. Marked, in the same save or
  later, its code may be corrected and it takes a supplier's lot.
  Without the permission the whole save is refused, in the reader's
  words, and nothing is changed.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--the-suppliers-lot-beside-our-code) ·
  [test](../../server/test/stock.e2e-spec.ts) "marks an older code as made here once, its own entry in the Activity log, and then it may be corrected (ADR-094, R7)" ·
  [test](../../server/test/stock.e2e-spec.ts) "never unmarks a code made here, saying it stays marked (ADR-094, R7)" ·
  [test](../../server/test/stock.e2e-spec.ts) "refuses the mark without stock.lot_made_here, in the reader’s words, and changes nothing (ADR-094, R7)" ·
  MC-3328
- **The mark is its own entry in the Activity log,** "Lot’s code marked
  as made up here", beside Lot updated where the same save changed
  more; a save that changed nothing, or only marked, writes no Lot
  updated.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--the-suppliers-lot-beside-our-code) ·
  [test](../../server/test/stock.e2e-spec.ts) "marks an older code as made here once, its own entry in the Activity log, and then it may be corrected (ADR-094, R7)" ·
  [test](../../server/test/stock.e2e-spec.ts) "marks and corrects in one save, an entry for each (ADR-094, R7)"
- **Lot updated keeps what the save changed, from and to,** each of the
  lot code, the supplier's lot, the expiry and its day that moved, and
  names the item's code and the lot, as a lot change does; so a
  corrected code is kept, the old and the new.
  [test](../../server/test/stock.e2e-spec.ts) "keeps a corrected code in Lot updated, the old and the new, naming the lot and its item (#687)" ·
  [test](../../server/test/stock.e2e-spec.ts) "keeps only what a save changed in Lot updated: the expiry alone (#687)"

## Starting lot tracking

- **A code not tracked by lot may start, once, by whoever may change
  items and correct counts,** products.update and stock.adjust both;
  never equipment, which is counted where it stands, and never a code
  that tracks lots already, each refused saying what to do, nothing
  written. Nothing turns it off: an item's update takes no lot tracking.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "refuses equipment, a code that tracks lots, another organization’s code, and anyone without both permissions, writing nothing (R13, R18)" ·
  [Help](../../client/src/help/guides/en/items.md#start-tracking-lots-tracking) ·
  MC-327
- **Receiving an item not tracked says no lot is asked,** in Receive
  stock and an order's Receive, one grey line under the item; for
  whoever may start tracking it ends with Start tracking lots…, whose
  question opens over the dialog, and once started the dialog asks the
  lot, what was typed kept.
  [test](../../client/src/inventory/receive-stock-dialog.test.tsx) "says under an item not tracked that no lot is asked, offering no start to whoever may not" ·
  [test](../../client/src/inventory/receive-stock-dialog.test.tsx) "starts lot tracking from the line over the dialog, then asks the lot, the quantity kept; Cancel gives focus back to the line" ·
  [test](../../client/src/orders/receive-line-dialog.test.tsx) "says under a line not tracked that no lot is asked, and asks the lot once tracking starts from it" ·
  [Help](../../client/src/help/guides/en/inventory.md#receive-stock-receive) ·
  MC-327
- **Before it starts, the question reads where the code's stock is,**
  each place and how much, and the runs in progress that make the code
  or use it from a place, each to close against the lot; a reader who
  may not see runs reads how many alone. A run still a draft is not in
  progress.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "asks where the stock is, then puts all of it into one lot made for us, noted, every figure as before (R14, R15)" ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "lists a run only for a reader who may see runs, its count for all (ADR-080)"
- **Started with stock, one lot made for us takes all of it,** at every
  place, a retired one too, which the stock never leaves, its code from
  the lot series, noted as the stock on hand when lot tracking started,
  with the supplier's lot and the expiry when given: one lot change a
  place, Lot tracking started, counted in neither In nor Out. With no expiry
  given, the lot's is not known yet, never Doesn't expire, so it is
  listed under Details to add and stays usable; the question starts on
  Not known yet, shown chosen. On hand, usable, Held,
  Free, Short and Coming read as before, with an expiry not in the past;
  who and when are in the item's History. With nothing on hand, tracking
  turns on alone and no lot is made; from then on, every movement of the
  code takes a lot.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "asks where the stock is, then puts all of it into one lot made for us, noted, every figure as before (R14, R15)" ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "stores the expiry as not known yet where the question gives none, every figure as before (S6, R15)" ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "starts for stock at a retired place too, which it never leaves, while a receipt there is still refused (review 74)" ·
  [test](../../client/src/products/product-detail-page.test.tsx) "asks with the places and what each holds, the code it will make, the runs that close against it and that it is one way; Cancel changes nothing (R14)" ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "turns tracking on alone for a code with nothing on hand: no lot, no movement, and a receipt then asks for one (R13)"
- **The code's whole cost history goes into the lot:** Stock value and
  the average are the same after, what waited for a cost still waits,
  now the lot's, and its cost given later lands on the lot. A batch whose
  run closes after its product started takes its cost on the lot, and a
  run that drew on stock still waiting stays provisional.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--the-cost-goes-with-the-stock-and-what-waits-still-waits) ·
  [ADR-048, amended](../adr/0048-cost.md#amendment-november-2026--the-cost-on-a-lot-change-and-no-average-while-stock-waits-adr-094) ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "moves the code’s whole cost history into the lot: Stock value unchanged, what waited still waits, its cost landing on the lot (R17)" ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "puts a batch’s cost on the lot, its run closing after its product started (Q2a)" ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "keeps a run provisional that drew on stock still waiting, once its component started (Q2a)"
- **A movement of the code begun before the start finishes first,** and
  its stock goes into the lot with the rest; one begun after asks for a
  lot.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "waits for a receipt begun before it, and puts that stock in the lot too (two at once)"
- **Stock that left before the start comes back as it left, then into
  the lot:** a return, an RMA's receipt and a voided shipment's goods
  come back with no lot, then one lot change, from before lot tracking,
  puts them into the lot that took the code's stock, at the cost they
  left at. A return takes that part of a line by quantity, beside the
  lots that shipped after, never more than shipped with no lot, each
  refused saying what to do; the list of what may come back offers it
  apart, with the lot it goes into. So what each lot shipped and what came back of it
  still match. Where the code started with nothing on hand, the first of
  it back makes that lot, made for us, noted the same, its expiry not
  known yet.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--the-cost-goes-with-the-stock-and-what-waits-still-waits) ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "takes back a sale shipped before the start by quantity, with no lot as it left, then into the start lot, at the cost it left at (Q3a)" ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "receives an RMA’s goods shipped before the start the same way, held to what it authorized (Q3a)" ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "voids a shipment made before the start: its goods back with no lot, as they left, then into the start lot, at the cost they left at (Q3a, #647)" ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "makes the start lot with the first stock back where the code started with nothing on hand, and puts the rest back in it, at the cost it left at (Q4a)" ·
  MC-614
- **Stock back from before takes no cost of its own:** where what it
  came from still waits for a cost, it waits too, and the cost given to
  that delivery later follows it into the lot; one given to it is
  refused, saying to cost the delivery it came from.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--the-cost-goes-with-the-stock-and-what-waits-still-waits) ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "carries a cost given later to stock back from before into its lot, which takes none by hand (Q3a, D5)"

## Moving stock to another lot

- **Part of a lot at one place moves into another lot of the same item,
  by whoever may correct counts,** stock.adjust, with a note saying
  why: one of the item's lots, or a new one, its code typed as printed
  or made for us. The stock stays at its place: one lot change, between
  lots, counted in neither In nor Out for the code, its On hand, Held
  and Free as before; with a lot chosen, Out of the first lot and In to
  the second. More than the lot holds there, the lot itself, another
  item's lot or another organization's, no lot and no note are each
  refused, saying what to do, and nothing is written, a code made for
  us using no number.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lot-changes.e2e-spec.ts) "moves part of a lot at one place into another of its lots, its value carried at the first lot’s average, both pools summing, the code’s figures as before (R20, Q1a)" ·
  [test](../../server/test/lot-changes.e2e-spec.ts) "reads a lot change’s second lot back on Movements, Out of the first and In to the second, and the other lot in each lot’s cost history (R20)" ·
  [test](../../server/test/lot-changes.e2e-spec.ts) "refuses more than is there, the same lot, another item’s lot, another organization’s lot or place, no lot, no note, and anyone without stock.adjust, writing nothing (R20, #314)" ·
  [Help](../../client/src/help/guides/en/inventory.md#move-ship-or-correct-move) ·
  MC-328
- **A lot issued to a run still open stays in its lot at the run's
  place,** since the run's close takes from the lots it was issued
  there: a move is refused, naming the run by its reference, or by what
  it plans when it has none, until the run is closed or cancelled; the
  same lot elsewhere moves. Its Actions grey Move to another lot…,
  saying "Issued to run …, still open".
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lot-changes.e2e-spec.ts) "refuses a move out of a lot issued to a run still open, naming the run, until it is cancelled, and its pile says why (review 73)" ·
  [test](../../client/src/inventory/inventory-page.test.tsx) "greys Move to another lot… for a lot issued to a run still open, naming the run" ·
  MC-328
- **A new lot starts as the first lot is:** its expiry, and for a code
  made for us its supplier's lot, unless the move gives either; a code
  typed from the box takes no supplier's lot, being the supplier's own,
  and one given for it is refused. A code the item has is chosen among
  its lots, never typed again (the code `lot_code_in_use`).
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lot-changes.e2e-spec.ts) "makes the new lot, typed or made for us, starting with the first lot’s expiry and supplier’s lot unless given (R20, E7)"
- **The value goes with the stock:** the first lot's share at its
  average, out of its pool and into the other lot's, so Stock value is
  the same. Where any of the first lot's stock still waits for a cost,
  the stock moved waits too, listed in Waiting for a cost with the lot
  it came from, until nothing that waited in the first lot before the
  move still does, and its lot gives no average meanwhile. It takes no
  cost of its own, waiting or not: one given to it is refused, naming
  the first lot to give it to.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--the-cost-goes-with-the-stock-and-what-waits-still-waits) ·
  [ADR-048, amended](../adr/0048-cost.md#amendment-november-2026--the-cost-on-a-lot-change-and-no-average-while-stock-waits-adr-094) ·
  [test](../../server/test/lot-changes.e2e-spec.ts) "moves part of a lot at one place into another of its lots, its value carried at the first lot’s average, both pools summing, the code’s figures as before (R20, Q1a)" ·
  [test](../../server/test/lot-changes.e2e-spec.ts) "marks the stock moved as waiting for a cost where some of the first lot’s waits, listed with the lot it came from (R20, 3a)" ·
  [test](../../server/test/costs.e2e-spec.ts) "keeps the stock moved waiting while anything the first lot waited for still does, its pool taking no average, and not after" ·
  [test](../../server/test/costs.e2e-spec.ts) "follows a chain of two moves, each lot waiting until the first receipt is costed" ·
  [test](../../server/test/costs.e2e-spec.ts) "refuses a cost by hand on the stock moved in, naming the lot to cost"
- **A cost given later follows the stock moved,** a delivery's cost set
  or corrected, or a batch's at its run's close. Of each move out of the
  lot after the stock arrived, the delivery's part is the quantity moved
  times the delivery's units still in the lot just before, over what the
  lot held then; that part takes its share of the cost to the lot it
  went to, and on from there to any lot it moved to next. What remains
  splits between the lot and its stock already gone, as any cost given
  late does, except that stock moved away and back is counted once, as
  the part that came back: of 10 received, 6 shipped and the 4 left moved
  away and back, the lot holds the 4's share and the 6's is gone. So
  the share of the stock moved depends only on what happened up to the
  move, none of it is recorded as gone, and each lot's cost history
  shows the part carried on, or the part that came, naming the other
  lot. The answer to a cost given names each lot it followed stock to,
  with its amount.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--the-cost-goes-with-the-stock-and-what-waits-still-waits) ·
  [test](../../server/test/costs.e2e-spec.ts) "carries 40.00 of 80.00 to the 50 moved, 20 of them the receipt’s by what the lot held: each lot 100.00 for 50, nothing issued, Stock value 200.00" ·
  [test](../../server/test/costs.e2e-spec.ts) "splits what stays after the move as ADR-048 does: 10 received, 5 shipped, 2 of the 5 left moved, costed at 10.00, 20.00 follows, 30.00 held, 50.00 issued" ·
  [test](../../server/test/costs.e2e-spec.ts) "values both lots of one receipt part moved and costed once, nothing issued" ·
  [test](../../server/test/costs.e2e-spec.ts) "gives the second lot the same share whatever the first ships after the move" ·
  [test](../../server/test/costs.e2e-spec.ts) "follows stock moved and moved back, the part back held in the first lot" ·
  [test](../../server/test/costs.e2e-spec.ts) "holds no more than the stock back in the first lot: 10 received, 6 shipped, the 4 left moved away and back, costed at 10.00, 40.00 held and 60.00 issued" ·
  [test](../../server/test/costs.e2e-spec.ts) "carries a correction after the move, upward and then downward, by what the lot held when it moved" ·
  [test](../../server/test/costs.e2e-spec.ts) "carries a batch’s cost at close to its output moved to another lot before it" ·
  [test](../../server/test/costs.e2e-spec.ts) "gives a cost and a move at once, neither waiting on the other (two at once)"
- **Movements names both lots of a lot change,** the lot it leaves and
  the lot it enters, and each lot's cost history names the other. Lot
  tracking started, and stock back from before, name the lot entered
  alone, there being no first.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../server/test/lot-changes.e2e-spec.ts) "reads a lot change’s second lot back on Movements, Out of the first and In to the second, and the other lot in each lot’s cost history (R20)" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "counts a lot change in neither In nor Out for its code, and Out of the lot it left, a lot started with none before it"
- **A lot change reads as the action that made it,** never "Lot
  changed": its reason Lot tracking started, Moved to another lot or Back
  from before lot tracking, on Movements, an item's Latest movements and
  the export's Reason, its Reason code still lot_change; its change "put
  900 each into a lot" for the first and the last, "moved 80 each to
  another lot" between two, with ", counted in neither" for one code;
  its place written once in From → to, with no arrow, since the stock
  did not move, the export keeping both From and To. The Reason filter
  keeps one option for the three, Lot changes, which no row says. A
  move's entry in the Activity log names both lots, To lot after the
  lot it left, each a link, its reason Moved to another lot.
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--a-lot-change-is-one-movement-counted-in-neither-in-nor-out) ·
  [test](../../client/src/inventory/movements-page.test.tsx) "reads a move between lots as Moved to another lot, its place once, both its lots each a link, and why" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "reads lot tracking started and stock back from before as their actions, each put into a lot at its place, written once" ·
  [test](../../client/src/inventory/movements-page.test.tsx) "offers the three kinds of lot change as one Reason, Lot changes, its chip saying so" ·
  [test](../../server/test/lot-changes.e2e-spec.ts) "moves part of a lot at one place into another of its lots, its value carried at the first lot’s average, both pools summing, the code’s figures as before (R20, Q1a)" ·
  [test](../../server/test/lot-tracking.e2e-spec.ts) "takes back a sale shipped before the start by quantity, with no lot as it left, then into the start lot, at the cost it left at (Q3a)" ·
  [test](../../server/src/core/audit/audit-words.spec.ts) "reads a move between lots as Moved to another lot, naming the lot it went to after the lot it left" ·
  [test](../../server/src/core/audit/audit-words.spec.ts) "names a filter on lot changes as the filter does, Lot changes" ·
  [Help](../../client/src/help/guides/en/movements.md#words-youll-meet-words) ·
  MC-331

## Counting in found stock

- **Stock found where an item has never been is counted in by Correct
  the count,** its reason found: into any place that holds stock
  directly, and for an item tracked by lot, one of its lots or a new lot
  made with the count, in the same write, its code typed or made for us. It needs stock.adjust, as
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
  chosen as such. Count it in says its lot must be new, which the write
  says and its reason never does (#649's 46). Receiving the same code
  again still adds to that lot.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--our-own-lot-codes-by-a-format-beside-document-numbering) ·
  [test](../../server/test/stock.e2e-spec.ts) "refuses a new lot whose code the item has, naming it at its field, and writes nothing" ·
  [test](../../server/test/lots-at-receipt.e2e-spec.ts) "tells a new lot by what the write says, never by the movement’s reason" ·
  [test](../../client/src/inventory/count-in-dialog.test.tsx) "says a code the item has at the lot number, focused there" ·
  MC-322
- **Found stock waits for a cost in a new lot, for an item with no cost
  yet, and wherever any of the stock it joins still waits for one,** the
  lot's, or the item's for one with no lots, even a part of it (#650).
  Its message says so, linked to Stock value's Waiting for a cost for a
  reader who may see costs, where it is given its cost on its own line.
  Otherwise found stock rides at its lot's average, or the item's for
  one with no lots.
  [ADR-093, amended](../adr/0093-inventory-and-movements.md#decided-before-building) ·
  [ADR-094](../adr/0094-lots-at-receipt.md#decision--the-cost-goes-with-the-stock-and-what-waits-still-waits) ·
  [ADR-048, amended](../adr/0048-cost.md#amendment-november-2026--the-cost-on-a-lot-change-and-no-average-while-stock-waits-adr-094) ·
  [test](../../server/test/stock.e2e-spec.ts) "makes a new lot with the count, at a place the item never was, and says it waits for a cost" ·
  [test](../../server/test/stock.e2e-spec.ts) "counts into a lot the item has at its average, not waiting for a cost" ·
  [test](../../server/test/costs.e2e-spec.ts) "counts found stock into a lot whose receipt waits for a cost as waiting too, listed, and costed on its own line" ·
  [test](../../server/test/costs.e2e-spec.ts) "takes no average from a pool only part of whose stock waits, and takes one again once none does (2a)" ·
  [test](../../client/src/inventory/count-in-dialog.test.tsx) "makes a new lot with the count, saying it waits for a cost, linked to Waiting for a cost" ·
  [Help](../../client/src/help/guides/en/inventory.md#move-ship-or-correct-move) ·
  MC-322
