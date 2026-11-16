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
