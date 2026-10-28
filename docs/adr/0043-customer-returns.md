---
status: accepted
date: 2026-09-23
---

# ADR-043 — Customer returns

## Context

Shipping had no counterpart. The `return` movement reason
existed with nothing writing it, so goods a customer sent back could only be
recorded as an adjustment — which says the count was wrong, when it was not.

## Decision — a return is a document against a sales order

The mirror of a
shipment: a header (destination, reason, note, who) with `return` movements as
the record, one per lot per line, each referencing it. Allowed on confirmed
and fulfilled sales, since a return most often arrives after the order is
done. Purchases are refused; goods sent back to a supplier are an adjustment.

## Decision — only what went can come back

A lot can be returned only if it
shipped on this order, and never more of it than went, counting earlier
returns. Both are read from the order's own shipment and return movements,
so no counter can drift from the ledger. A lot that never reached this
customer cannot enter the recall trail against their order.

## Decision — shipped is never reduced

`order_lines.quantity_returned`
rises beside `quantity_fulfilled`, checked never to exceed it. Lowering
"shipped" would erase that it shipped, which is the history a recall reads.

## Decision — receive, then decide

A return lands wherever the receiver
chooses, usually a location marked unavailable (ADR-042), so nothing ships it
again before it is checked. Restocking is then an ordinary move and writing
off an ordinary correction; neither is part of the return.

## Decision — tracked lines by lot, summed in SQL

A tracked line sends the
lots that came back, an untracked line a quantity, and the server refuses
the wrong shape. The line's total is computed in the database, not by the
client (ADR-025).

## Decision — `orders.receive`

Taking goods back is receiving, done at the
same dock by the same person; it writes inbound movements as a receipt does.

## Consequences

Deferred: refunds and credit notes, which belong to
invoicing; returns to suppliers as a document; and restock or write-off as a
step of the return rather than separate actions.

## Deferred: return authorization (RMA)

A return is recorded when the goods
arrive. There is no step before that where the customer asks, the return is
approved, and the goods are expected. That approval is where replacement,
credit, or nothing is decided, so it belongs with credit notes (v0.4), not
before them.
