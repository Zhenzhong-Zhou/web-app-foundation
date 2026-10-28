---
status: accepted
date: 2026-09-10
---

# ADR-027 — Orders are purchase and sale, and nothing else

## Context

The inventory domain can now count and move stock, and every
movement is entered by hand. Orders are what make a movement expected: a
receipt that was planned, against a document someone can point at.

The difficulty is that several things in a warehouse look like orders and are
not. Production, stocktakes, transfers between sites, and consignment all
arrive in the same conversation, and folding them into one table produces a row
where most columns are null for most rows. Deciding what an order *is* matters
more here than deciding its columns.

## Decision — `orders` and `order_lines`, covering purchase and sale

```text
orders       id, organization_id, partner_id, direction, status,
             reference, expected_at, note, created_by
order_lines  id, organization_id, order_id, variant_id,
             sku,                       -- snapshotted, as movements do
             quantity_ordered, quantity_fulfilled
```

A purchase order and a sales order are the same shape mirrored: a partner,
lines of variants, one direction, fulfilment that moves stock. That symmetry is
what makes one table honest rather than convenient — the columns mean the same
thing in both cases, read from the other side.

## Direction is a column, not a table

`purchase` and `sale`, closed set,
check constraint. A lookup table earns its place when rows are added at runtime
or carry attributes; these do neither, and a join to read a word costs every
query. Same precedent as `products.type` and `stock_movements.reason`.

## Decision — status is the document's lifecycle, never fulfilment progress

```text
draft → confirmed → received
                ↘ cancelled
```

Four values, and the temptation is to add `partially_received` and
`fully_received` beside them. That is the mistake this decision exists to
prevent: how much has arrived is `sum(quantity_fulfilled)` against
`sum(quantity_ordered)` across the lines, computed on read. Storing it too
means two sources of truth for one question, and the stored one goes stale the
first time a line changes.

`received` is a person saying the order is done, which can be true with a short
shipment nobody expects to complete. That is a decision, not an arithmetic
result, which is why it is a status and the percentages are not.

The vocabulary will need widening when sales orders arrive — `received` does
not describe an outbound order. Adding a value to a check constraint is a drop
and a re-add with no row to rewrite, so it waits until the outbound words are
chosen against a real screen.

## Decision — fulfilment is a quantity on the line, and the movement carries the reference

Receiving against a purchase order writes an ordinary `receipt` movement with
`reference_type: 'purchase_order'` and `reference_id` set (ADR-023), and
increments `quantity_fulfilled` on the line in the same transaction. There is no
second ledger and no separate receipt table.

This is what those nullable reference columns were reserved for. A movement
entered by hand and one raised by an order are the same row; the order adds a
reference, and existing rows stay valid — which is exactly the property ADR-023
was protecting by leaving them nullable.

## No `reserved` column yet

Purchase orders are inbound, so nothing is
promised to anyone and there is nothing to reserve. `available = on_hand −
reserved` is a third quantity and a second thing the cache must keep honest,
and its semantics are settled by whatever first writes to it. Adding the column
when sales orders exist costs one migration against rows that all read zero.

## Decision — approval is not part of an order

An approval is a property of documents that commit the organization to
something: a purchase order, a large adjustment, eventually a transfer between
sites. Built into `orders` it cannot be reused, and it gets built again for the
second thing that needs it.

When it arrives it is its own table, polymorphic the way `audit_log` is:
`resource_type`, `resource_id`, requested by, approved by, status. Anything
becomes approvable by referencing it, and `orders` does not change — approval
inserts a state ahead of `confirmed`.

A purchase requisition is the same deferral. It is an internal request with no
supplier and no commitment, which only means something once someone other than
the requester has to approve it.

## Consequence

One extra write per receipt, in the transaction that already
exists. Order progress is a query over lines rather than a column, which is the
cost of not storing a derived value twice.

Rejected here and deliberately out of scope, each for its own reason:

- **Production orders.** No partner, and lines that go both ways — consuming
  materials and producing goods. One order with two opposite kinds of line is
  not the shape above, and `partner_id` would be null for exactly one direction.
  `stock_movements.reason` already carries `production` and `consumption`, so
  the ledger is ready when the table is written.
- **Stocktakes.** Not an order at all. There is no planned quantity, only
  expected against found, producing adjustments. A count sheet is its own shape
  end to end.
- **Transfer orders.** No partner and two locations. A planned transfer is real
  in a multi-site operation and meaningless in one building; the movement
  already exists, and the order would only be the intent to make it.
- **Consignment.** An ownership question — stock at a customer's site that is
  still yours — which changes what a `stock_levels` row means rather than what
  an order is. Modelling it as a document type would be treating the symptom.

## Deferred, and recorded as open decisions

Prices on lines, which drag in
currency and tax and belong with invoicing. Partial-line cancellation, which
needs a reason and is a question about what a line means once fulfilment has
started. Expected dates per line rather than per order, which matters for
staggered deliveries and not before.
